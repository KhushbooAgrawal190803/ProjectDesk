'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Lock, RefreshCw, X, Check, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  getSystemConsoleSnapshot,
  saveConsoleCell,
  getConsoleMeta,
  getUpdatedCells,
  deleteWorkbookAfterConfirm,
  verifyConsolePassphrase,
} from './system-console-actions'
import type { SystemConsoleMeta } from './system-console-actions'

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  return bytes
}

/** Web Crypto typings require `BufferSource` (not `Uint8Array<ArrayBufferLike>`). */
function copyAsBufferSource(bytes: Uint8Array): BufferSource {
  const u = new Uint8Array(bytes.byteLength)
  u.set(bytes)
  return u
}
function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('')
}

async function deriveKey(passphrase: string, saltHex: string): Promise<CryptoKey> {
  const rawKey = await crypto.subtle.importKey(
    'raw',
    copyAsBufferSource(new TextEncoder().encode(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: copyAsBufferSource(hexToBytes(saltHex)), iterations: 100_000, hash: 'SHA-256' },
    rawKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encryptCell(plain: string, key: CryptoKey) {
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: copyAsBufferSource(iv) },
    key,
    copyAsBufferSource(new TextEncoder().encode(plain))
  )
  return { iv: bytesToHex(iv), cipherText: bytesToHex(new Uint8Array(encrypted)) }
}

async function decryptCell(cipherHex: string, ivHex: string, key: CryptoKey): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: copyAsBufferSource(hexToBytes(ivHex)) },
    key,
    copyAsBufferSource(hexToBytes(cipherHex))
  )
  return new TextDecoder().decode(plain)
}

const ROWS = 100
const COLS = 100
const ROW_H = 36
const COL_W = 72
const HDR_W = 44
const HDR_H = 32
const BUFFER = 8

const DELETE_CONFIRM_TEXT = 'DELETE WORKBOOK'

type Phase = 'passphrase' | 'active' | 'wiped'

export function SystemConsoleClient() {
  const [phase, setPhase] = useState<Phase>('passphrase')
  const [passInput, setPassInput] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [unlocking, setUnlocking] = useState(false)

  const keyRef = useRef<CryptoKey | null>(null)
  const metaRef = useRef<SystemConsoleMeta | null>(null)
  const cellsRef = useRef<Map<string, string>>(new Map())
  const lastSyncRef = useRef<string>(new Date(0).toISOString())

  const [tick, setTick] = useState(0)
  const bump = () => setTick((n) => n + 1)

  const [sel, setSel] = useState<{ r: number; c: number } | null>(null)
  const [editVal, setEditVal] = useState('')
  const [saving, setSaving] = useState(false)
  const editRef = useRef<HTMLTextAreaElement>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewH, setViewH] = useState(400)

  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0)
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)

  useEffect(() => {
    setPhase('passphrase')
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const obs = new ResizeObserver(() => setViewH(el.clientHeight))
    obs.observe(el)
    setViewH(el.clientHeight)
    return () => obs.disconnect()
  }, [phase])

  useEffect(() => {
    if (phase !== 'active') return
    const id = setInterval(syncDelta, 5000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  useEffect(() => {
    if (sel) setTimeout(() => editRef.current?.focus(), 80)
  }, [sel])

  const unlock = useCallback(async (passphrase: string) => {
    setUnlocking(true)
    try {
      await verifyConsolePassphrase(passphrase)
      const { meta, cells } = await getSystemConsoleSnapshot()
      metaRef.current = meta

      const key = await deriveKey(passphrase, meta.kdf_salt)

      if (cells.length > 0) {
        try {
          await decryptCell(cells[0].cipher_text, cells[0].iv, key)
        } catch {
          toast.error('Cannot read workbook (data may be from an older key).')
          setPhase('passphrase')
          return
        }
      }

      const map = new Map<string, string>()
      for (const c of cells) {
        try {
          const plain = await decryptCell(c.cipher_text, c.iv, key)
          if (plain) map.set(`${c.row_index},${c.col_index}`, plain)
        } catch {
          /* skip */
        }
      }

      keyRef.current = key
      cellsRef.current = map
      lastSyncRef.current = new Date().toISOString()
      setPhase('active')
      bump()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to unlock'
      toast.error(msg)
      setPhase('passphrase')
    } finally {
      setUnlocking(false)
    }
  }, [])

  const syncDelta = async () => {
    const key = keyRef.current
    const meta = metaRef.current
    if (!key || !meta) return

    try {
      const current = await getConsoleMeta()
      if (current.version !== meta.version) {
        toast.message('Workbook was updated. Enter passphrase again.')
        keyRef.current = null
        cellsRef.current = new Map()
        setSel(null)
        setPhase('passphrase')
        return
      }

      const since = lastSyncRef.current
      lastSyncRef.current = new Date().toISOString()
      const updated = await getUpdatedCells(since)
      if (!updated.length) return

      for (const c of updated) {
        const k = `${c.row_index},${c.col_index}`
        if (!c.cipher_text) {
          cellsRef.current.delete(k)
        } else {
          try {
            const plain = await decryptCell(c.cipher_text, c.iv, key)
            if (plain) cellsRef.current.set(k, plain)
            else cellsRef.current.delete(k)
          } catch {
            /* ignore */
          }
        }
      }
      bump()
    } catch {
      /* next poll */
    }
  }

  const selectCell = (r: number, c: number) => {
    setSel({ r, c })
    setEditVal(cellsRef.current.get(`${r},${c}`) || '')
  }

  const commitEdit = async () => {
    if (!sel || !keyRef.current || !metaRef.current) return
    const { r, c } = sel
    const trimmed = editVal
    setSaving(true)
    try {
      if (!trimmed.trim()) {
        await saveConsoleCell(r, c, '', '', metaRef.current.version)
        cellsRef.current.delete(`${r},${c}`)
      } else {
        const { iv, cipherText } = await encryptCell(trimmed, keyRef.current)
        await saveConsoleCell(r, c, cipherText, iv, metaRef.current.version)
        cellsRef.current.set(`${r},${c}`, trimmed)
      }
      bump()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const runDeleteWorkbook = async () => {
    setDeleteBusy(true)
    try {
      await deleteWorkbookAfterConfirm(deleteConfirmInput)
      keyRef.current = null
      metaRef.current = null
      cellsRef.current = new Map()
      setDeleteStep(0)
      setDeleteConfirmInput('')
      setSel(null)
      setPhase('wiped')
      toast.success('Workbook removed.')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not remove workbook'
      toast.error(msg)
    } finally {
      setDeleteBusy(false)
    }
  }

  const firstRow = Math.max(0, Math.floor(scrollTop / ROW_H) - BUFFER)
  const lastRow = Math.min(ROWS - 1, Math.ceil((scrollTop + viewH) / ROW_H) + BUFFER)

  if (phase === 'wiped') {
    return (
      <div className="flex flex-col items-center justify-center py-12 sm:py-16 gap-5 text-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="rounded-full bg-zinc-100 p-4">
          <Trash2 className="w-10 h-10 text-zinc-500" aria-hidden />
        </div>
        <div>
          <p className="text-lg font-semibold text-zinc-900">Workbook empty</p>
          <p className="text-sm text-zinc-500 mt-1">You can create a new session below.</p>
        </div>
        <Button
          variant="outline"
          className="h-12 min-h-[44px] px-8 text-base"
          onClick={() => {
            setPhase('passphrase')
            setPassInput('')
          }}
        >
          Continue
        </Button>
      </div>
    )
  }

  if (phase === 'passphrase') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] px-4 py-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-zinc-900">System Console</h2>
            <p className="text-sm text-zinc-500 mt-1">Enter the shared workbook passphrase</p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              unlock(passInput)
            }}
            className="space-y-4"
          >
            <div className="relative">
              <Input
                type={showPass ? 'text' : 'password'}
                value={passInput}
                onChange={(e) => setPassInput(e.target.value)}
                placeholder="Passphrase"
                className="h-12 min-h-[48px] text-base pr-12"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-end text-zinc-400 active:text-zinc-700"
                onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? 'Hide passphrase' : 'Show passphrase'}
              >
                <span className="text-xs font-medium">{showPass ? 'Hide' : 'Show'}</span>
              </button>
            </div>
            <Button type="submit" className="w-full h-12 min-h-[48px] text-base" disabled={unlocking || !passInput}>
              {unlocking ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" aria-hidden />
                  Unlocking…
                </>
              ) : (
                'Unlock'
              )}
            </Button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-[60dvh] max-h-[min(85dvh,900px)] touch-manipulation" data-sync={tick}>
      <div className="flex flex-wrap items-center gap-2 px-2 sm:px-3 py-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] bg-zinc-50 border-b border-zinc-200 shrink-0">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="h-11 min-h-[44px] px-3 sm:px-4 text-sm font-medium order-first sm:order-none"
          onClick={() => {
            setDeleteStep(1)
            setDeleteConfirmInput('')
          }}
        >
          <Trash2 className="w-4 h-4 mr-1.5 shrink-0" aria-hidden />
          Delete workbook
        </Button>
        <p className="text-xs text-zinc-500 font-mono truncate flex-1 min-w-0 basis-full sm:basis-auto order-3 sm:order-none py-1">
          {sel ? `R${sel.r + 1} · C${sel.c + 1}` : '100×100 — tap a cell'}
        </p>
        <button
          type="button"
          className="ml-auto flex items-center gap-1.5 text-sm text-zinc-600 border border-zinc-200 rounded-lg px-3 min-h-[44px] min-w-[44px] active:bg-zinc-100"
            onClick={() => {
              keyRef.current = null
              setSel(null)
              setPhase('passphrase')
            }}
        >
          <Lock className="w-4 h-4 shrink-0" aria-hidden />
          Lock
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div
          className="relative"
          style={{ width: HDR_W + COLS * COL_W, height: HDR_H + ROWS * ROW_H }}
        >
          <div
            className="flex sticky top-0 z-30 bg-zinc-100 border-b-2 border-zinc-300"
            style={{ height: HDR_H }}
          >
            <div
              className="shrink-0 sticky left-0 z-40 bg-zinc-200 border-r-2 border-zinc-300"
              style={{ width: HDR_W, height: HDR_H }}
            />
            {Array.from({ length: COLS }, (_, c) => (
              <div
                key={c}
                className={`shrink-0 flex items-center justify-center text-[10px] font-mono font-semibold border-r border-zinc-200 ${
                  sel?.c === c ? 'bg-blue-100 text-blue-800' : 'text-zinc-600'
                }`}
                style={{ width: COL_W, height: HDR_H }}
              >
                {c + 1}
              </div>
            ))}
          </div>

          {firstRow > 0 && <div style={{ height: firstRow * ROW_H }} />}

          {Array.from({ length: lastRow - firstRow + 1 }, (_, i) => {
            const r = firstRow + i
            return (
              <div key={r} className="flex" style={{ height: ROW_H }}>
                <div
                  className={`shrink-0 sticky left-0 z-20 border-r-2 border-b border-zinc-200 flex items-center justify-center text-[10px] font-mono font-semibold ${
                    sel?.r === r ? 'bg-blue-100 text-blue-800 border-zinc-300' : 'bg-zinc-50 text-zinc-500'
                  }`}
                  style={{ width: HDR_W }}
                >
                  {r + 1}
                </div>
                {Array.from({ length: COLS }, (_, c) => {
                  const val = cellsRef.current.get(`${r},${c}`) || ''
                  const isActive = sel?.r === r && sel?.c === c
                  const hasVal = val.length > 0
                  return (
                    <div
                      key={`${r}-${c}`}
                      role="button"
                      tabIndex={0}
                      className={`shrink-0 border-r border-b flex items-center px-1 overflow-hidden whitespace-nowrap text-[11px] font-mono leading-tight active:opacity-90 ${
                        isActive
                          ? 'bg-blue-50 border-blue-400 ring-2 ring-inset ring-blue-500 z-10'
                          : hasVal
                            ? 'border-zinc-200 bg-white text-zinc-800'
                            : 'border-zinc-100 bg-zinc-50/80 text-transparent'
                      }`}
                      style={{ width: COL_W, height: ROW_H, minHeight: ROW_H }}
                      onClick={() => selectCell(r, c)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault()
                          selectCell(r, c)
                        }
                      }}
                    >
                      <span className={`truncate block w-full ${hasVal ? 'text-zinc-800' : ''}`}>{hasVal ? val : '\u00a0'}</span>
                    </div>
                  )
                })}
              </div>
            )
          })}

          {lastRow < ROWS - 1 && <div style={{ height: (ROWS - 1 - lastRow) * ROW_H }} />}
        </div>
      </div>

      {sel && (
        <div className="shrink-0 border-t border-zinc-200 bg-white px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-2 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-zinc-400 font-mono mb-1">
              R{sel.r + 1} · C{sel.c + 1}
            </p>
            <textarea
              ref={editRef}
              value={editVal}
              onChange={(e) => setEditVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  commitEdit()
                }
                if (e.key === 'Escape') setSel(null)
                if (e.key === 'Tab') {
                  e.preventDefault()
                  void commitEdit().then(() => {
                    const nextC = e.shiftKey ? Math.max(0, sel.c - 1) : Math.min(COLS - 1, sel.c + 1)
                    selectCell(sel.r, nextC)
                  })
                }
              }}
              className="w-full text-base sm:text-sm font-mono border border-zinc-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 leading-snug bg-zinc-50 min-h-[88px]"
              rows={3}
              placeholder="Cell value…"
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="sentences"
            />
          </div>
          <div className="flex flex-col gap-2 pt-7 shrink-0">
            <button
              type="button"
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-blue-600 text-white flex items-center justify-center disabled:opacity-50 active:bg-blue-700"
              disabled={saving}
              onClick={() => void commitEdit()}
              aria-label="Save"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-5 h-5" />}
            </button>
            <button
              type="button"
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl border border-zinc-200 flex items-center justify-center active:bg-zinc-50"
              onClick={() => setSel(null)}
              aria-label="Close editor"
            >
              <X className="w-5 h-5 text-zinc-500" />
            </button>
          </div>
        </div>
      )}

      {deleteStep > 0 && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setDeleteStep(0)
              setDeleteConfirmInput('')
            }
          }}
        >
          <div
            className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {deleteStep === 1 && (
              <>
                <h3 id="delete-dialog-title" className="text-lg font-semibold text-zinc-900 pr-8">
                  Delete workbook?
                </h3>
                <p className="text-sm text-zinc-600 mt-2 leading-relaxed">
                  All cells in this shared workbook will be removed. Other admins will see an empty sheet. This cannot be undone.
                </p>
                <div className="flex gap-3 mt-6">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-12 min-h-[48px] text-base"
                    onClick={() => setDeleteStep(0)}
                  >
                    No
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    className="flex-1 h-12 min-h-[48px] text-base"
                    onClick={() => setDeleteStep(2)}
                  >
                    Yes
                  </Button>
                </div>
              </>
            )}
            {deleteStep === 2 && (
              <>
                <h3 className="text-lg font-semibold text-zinc-900">Confirm deletion</h3>
                <p className="text-sm text-zinc-600 mt-2">
                  Type <span className="font-mono font-semibold text-zinc-800">{DELETE_CONFIRM_TEXT}</span> to confirm.
                </p>
                <Input
                  value={deleteConfirmInput}
                  onChange={(e) => setDeleteConfirmInput(e.target.value)}
                  className="h-12 min-h-[48px] text-base mt-4 font-mono"
                  placeholder={DELETE_CONFIRM_TEXT}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void runDeleteWorkbook()
                  }}
                />
                <div className="flex gap-3 mt-6">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-12 min-h-[48px] text-base"
                    disabled={deleteBusy}
                    onClick={() => {
                      setDeleteStep(0)
                      setDeleteConfirmInput('')
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className="flex-1 h-12 min-h-[48px] text-base"
                    disabled={
                      deleteBusy || deleteConfirmInput.trim() !== DELETE_CONFIRM_TEXT
                    }
                    onClick={() => void runDeleteWorkbook()}
                  >
                    {deleteBusy ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
                    Delete
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
