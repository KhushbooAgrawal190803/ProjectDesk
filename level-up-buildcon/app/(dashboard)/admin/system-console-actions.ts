'use server'

import { requireRole } from '@/lib/auth/get-user'
import { getServerEnv } from '@/lib/server-env'
import { createServiceClient } from '@/lib/supabase/server'
import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'

const WORKBOOK_DELETE_CONFIRM = 'DELETE WORKBOOK'

export interface SystemConsoleMeta {
  id: number
  kdf_salt: string
  version: number
  updated_at: string
}

export interface SystemConsoleCell {
  row_index: number
  col_index: number
  cipher_text: string
  iv: string
  updated_at: string
}

async function ensureMeta(supabase: Awaited<ReturnType<typeof createServiceClient>>): Promise<SystemConsoleMeta> {
  const { data: existing } = await supabase
    .from('system_console_meta')
    .select('id, kdf_salt, version, updated_at')
    .eq('id', 1)
    .maybeSingle()

  if (existing) return existing as SystemConsoleMeta

  const salt = randomBytes(32).toString('hex')
  const { data: created, error } = await supabase
    .from('system_console_meta')
    .upsert({ id: 1, kdf_salt: salt, version: 1 }, { onConflict: 'id' })
    .select('id, kdf_salt, version, updated_at')
    .single()

  if (error || !created) throw new Error(`Failed to initialise console metadata: ${error?.message}`)
  return created as SystemConsoleMeta
}

export async function getSystemConsoleSnapshot(): Promise<{ meta: SystemConsoleMeta; cells: SystemConsoleCell[] }> {
  await requireRole(['ADMIN'])
  const supabase = await createServiceClient()
  const meta = await ensureMeta(supabase)

  const { data: cells, error } = await supabase
    .from('system_console_cells')
    .select('row_index, col_index, cipher_text, iv, updated_at')
    .order('updated_at', { ascending: true })

  if (error) throw new Error(`Failed to load console cells: ${error.message}`)
  return { meta, cells: (cells || []) as SystemConsoleCell[] }
}

export async function getConsoleMeta(): Promise<{ version: number; kdf_salt: string }> {
  await requireRole(['ADMIN'])
  const supabase = await createServiceClient()
  const meta = await ensureMeta(supabase)
  return { version: meta.version, kdf_salt: meta.kdf_salt }
}

export async function verifyConsolePassphrase(phrase: string): Promise<void> {
  await requireRole(['ADMIN'])
  const expected = getServerEnv(['SYSTEM', 'CONSOLE', 'PASSPHRASE'])?.trim()
  if (!expected || expected.length < 8) {
    throw new Error(
      'Workbook access is not configured. Add SYSTEM_CONSOLE_PASSPHRASE (8+ chars) to level-up-buildcon/.env.local (local) or Vercel → Settings → Environment Variables (production), then restart / redeploy.',
    )
  }
  if (!phrase || phrase !== expected) {
    throw new Error('Incorrect passphrase')
  }
}

export async function getUpdatedCells(since: string): Promise<SystemConsoleCell[]> {
  await requireRole(['ADMIN'])
  const supabase = await createServiceClient()

  const { data, error } = await supabase
    .from('system_console_cells')
    .select('row_index, col_index, cipher_text, iv, updated_at')
    .gt('updated_at', since)
    .order('updated_at', { ascending: true })

  if (error) throw new Error(`Failed to fetch updated cells: ${error.message}`)
  return (data || []) as SystemConsoleCell[]
}

export async function saveConsoleCell(
  rowIndex: number,
  colIndex: number,
  cipherText: string,
  iv: string,
  expectedVersion: number
): Promise<void> {
  await requireRole(['ADMIN'])
  const supabase = await createServiceClient()

  const meta = await ensureMeta(supabase)
  if (meta.version !== expectedVersion) {
    throw new Error('Console version mismatch — it may have been wiped. Please reload.')
  }

  if (!cipherText) {
    await supabase
      .from('system_console_cells')
      .delete()
      .eq('row_index', rowIndex)
      .eq('col_index', colIndex)
    return
  }

  const { error } = await supabase
    .from('system_console_cells')
    .upsert(
      { row_index: rowIndex, col_index: colIndex, cipher_text: cipherText, iv, updated_at: new Date().toISOString() },
      { onConflict: 'row_index,col_index' }
    )

  if (error) throw new Error(`Failed to save cell: ${error.message}`)
}

export async function wipeSystemConsole(secretPhrase: string): Promise<{ success: true }> {
  const profile = await requireRole(['ADMIN'])
  const supabase = await createServiceClient()

  const expected = getServerEnv(['SYSTEM', 'CONSOLE', 'KILL', 'PHRASE'])
  if (!expected) throw new Error('Server configuration missing')
  if (!secretPhrase || secretPhrase !== expected) throw new Error('Invalid confirmation')

  return _performWipe(supabase, profile.id, profile.email)
}

export async function deleteWorkbookAfterConfirm(typedConfirmation: string): Promise<{ success: true }> {
  const profile = await requireRole(['ADMIN'])
  if (typedConfirmation.trim() !== WORKBOOK_DELETE_CONFIRM) {
    throw new Error('Type the confirmation text exactly.')
  }
  const supabase = await createServiceClient()
  return _performWipe(supabase, profile.id, profile.email)
}

export async function _performConsolePurge(): Promise<void> {
  const supabase = await createServiceClient()
  await _performWipe(supabase, null, 'destruct-api')
}

async function _performWipe(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  adminId: string | null,
  adminEmail: string
): Promise<{ success: true }> {
  const { data: meta } = await supabase
    .from('system_console_meta')
    .select('version')
    .eq('id', 1)
    .maybeSingle()

  const nextVersion = ((meta?.version as number) || 1) + 1
  const nextSalt = randomBytes(32).toString('hex')

  await supabase
    .from('system_console_cells')
    .delete()
    .gte('row_index', 0)

  await supabase
    .from('system_console_meta')
    .upsert(
      { id: 1, kdf_salt: nextSalt, version: nextVersion, updated_at: new Date().toISOString() },
      { onConflict: 'id' }
    )

  if (adminId) {
    await supabase.from('admin_audit_log').insert({
      admin_id: adminId,
      action: 'SYSTEM_CONSOLE_WIPED',
      details: { by: adminEmail, new_version: nextVersion },
    })
  }

  revalidatePath('/admin')
  return { success: true }
}
