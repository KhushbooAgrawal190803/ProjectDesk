'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  getSlabsWithStats, getSlabBookings,
  sendPaymentReminder, sendAllPaymentReminders,
  type SlabWithStats, type ReminderBooking,
} from './reminder-actions'
import { toast } from 'sonner'
import {
  ChevronRight, ArrowLeft, Mail, MailCheck, Search, X,
  Loader2, AlertCircle, SendHorizonal, CheckCircle2,
} from 'lucide-react'
import { format } from 'date-fns'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

function payStatus(b: ReminderBooking): 'paid' | 'partial' | 'unpaid' {
  if (b.amount_received <= 0) return 'unpaid'
  if (b.amount_received >= b.amount_due) return 'paid'
  return 'partial'
}

const STATUS_BADGE: Record<string, string> = {
  paid:    'bg-green-100 text-green-800 border-green-200',
  partial: 'bg-amber-100 text-amber-800 border-amber-200',
  unpaid:  'bg-red-100 text-red-700 border-red-200',
}

// ─────────────────────────────────────────────────────────
// Slab list view
// ─────────────────────────────────────────────────────────
function SlabList({
  slabs, loading, onSelect,
}: {
  slabs: SlabWithStats[]
  loading: boolean
  onSelect: (s: SlabWithStats) => void
}) {
  if (loading) return (
    <div className="flex items-center gap-2 justify-center py-16 text-zinc-400">
      <Loader2 className="w-5 h-5 animate-spin" /> Loading slabs…
    </div>
  )

  return (
    <div className="space-y-2">
      <p className="text-sm text-zinc-500 mb-4">
        Click a payment milestone to view bookings and send reminders.
      </p>
      {slabs.map((s) => {
        const pct = s.total > 0 ? Math.round((s.paid / s.total) * 100) : 0
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s)}
            className="w-full text-left group flex items-center gap-4 p-4 rounded-xl border border-zinc-200 bg-white hover:border-zinc-400 hover:shadow-sm transition-all"
          >
            <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center shrink-0 text-sm font-semibold text-zinc-600 group-hover:bg-zinc-900 group-hover:text-white transition-colors">
              {s.sr_no}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-zinc-900 text-sm leading-snug">{s.label}</p>
              <div className="flex items-center gap-3 mt-1.5">
                <div className="flex-1 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-zinc-400 shrink-0">{pct}% collected</span>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-center">
                <p className="text-lg font-semibold text-green-700">{s.paid}</p>
                <p className="text-xs text-zinc-400">Paid</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-red-600">{s.unpaid}</p>
                <p className="text-xs text-zinc-400">Unpaid</p>
              </div>
              <Badge variant="outline" className="text-xs font-medium text-zinc-500">{s.percentage}%</Badge>
              <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-600 transition-colors" />
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Slab detail / booking list view
// ─────────────────────────────────────────────────────────
function SlabDetail({
  slab, onBack,
}: {
  slab: SlabWithStats
  onBack: () => void
}) {
  const [bookings, setBookings] = useState<ReminderBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'partial' | 'paid'>('all')
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [sendingAll, setSendingAll] = useState(false)
  const [sentIds, setSentIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setLoading(true)
    getSlabBookings(slab.id).then((data) => {
      setBookings(data)
      setLoading(false)
    })
  }, [slab.id])

  const stats = useMemo(() => ({
    paid: bookings.filter(b => payStatus(b) === 'paid').length,
    partial: bookings.filter(b => payStatus(b) === 'partial').length,
    unpaid: bookings.filter(b => payStatus(b) === 'unpaid').length,
    totalDue: bookings.reduce((s, b) => s + b.amount_due, 0),
    totalReceived: bookings.reduce((s, b) => s + b.amount_received, 0),
  }), [bookings])

  const filtered = useMemo(() => {
    let rows = bookings
    if (statusFilter !== 'all') rows = rows.filter(b => payStatus(b) === statusFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(b =>
        b.applicant_name?.toLowerCase().includes(q) ||
        b.unit_no?.toLowerCase().includes(q) ||
        b.serial_display?.toLowerCase().includes(q) ||
        b.applicant_email?.toLowerCase().includes(q)
      )
    }
    return rows
  }, [bookings, statusFilter, search])

  const handleSend = async (bookingId: string) => {
    setSendingId(bookingId)
    try {
      const res = await sendPaymentReminder(bookingId, slab.id)
      if (res.success) {
        toast.success('Reminder sent')
        setSentIds(prev => new Set([...prev, bookingId]))
        setBookings(prev => prev.map(b =>
          b.id === bookingId ? { ...b, last_reminder_sent_at: new Date().toISOString() } : b
        ))
      } else {
        toast.error(res.message)
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to send')
    } finally {
      setSendingId(null)
    }
  }

  const handleSendAll = async () => {
    const unpaidWithEmail = filtered.filter(b => payStatus(b) !== 'paid' && b.applicant_email)
    if (unpaidWithEmail.length === 0) {
      toast.info('No unpaid bookings with email addresses in current filter')
      return
    }
    setSendingAll(true)
    try {
      const res = await sendAllPaymentReminders(slab.id)
      toast.success(`Reminders sent: ${res.sent} sent, ${res.failed} failed, ${res.skipped} skipped (no email)`)
      // Refresh
      const fresh = await getSlabBookings(slab.id)
      setBookings(fresh)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to send all')
    } finally {
      setSendingAll(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 -ml-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-zinc-900 text-sm leading-tight">
            Slab {slab.sr_no}: {slab.label}
          </h3>
          <p className="text-xs text-zinc-500">{slab.percentage}% of total cost</p>
        </div>
        <Button
          size="sm"
          onClick={handleSendAll}
          disabled={sendingAll}
          className="gap-2 shrink-0"
        >
          {sendingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizonal className="w-4 h-4" />}
          Send All Reminders
        </Button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
          <p className="text-xs text-zinc-500 mb-0.5">Total Due</p>
          <p className="text-base font-semibold">{fmt(stats.totalDue)}</p>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-xs text-green-600 mb-0.5">Collected</p>
          <p className="text-base font-semibold text-green-800">{fmt(stats.totalReceived)}</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-xs text-red-500 mb-0.5">Outstanding</p>
          <p className="text-base font-semibold text-red-700">{fmt(stats.totalDue - stats.totalReceived)}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 flex items-center gap-3">
          <div className="text-center flex-1">
            <p className="text-base font-semibold text-green-700">{stats.paid}</p>
            <p className="text-xs text-zinc-400">Paid</p>
          </div>
          <div className="w-px h-8 bg-zinc-200" />
          <div className="text-center flex-1">
            <p className="text-base font-semibold text-amber-600">{stats.partial}</p>
            <p className="text-xs text-zinc-400">Partial</p>
          </div>
          <div className="w-px h-8 bg-zinc-200" />
          <div className="text-center flex-1">
            <p className="text-base font-semibold text-red-600">{stats.unpaid}</p>
            <p className="text-xs text-zinc-400">Unpaid</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-zinc-200 overflow-hidden text-sm">
          {(['all', 'unpaid', 'partial', 'paid'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 font-medium capitalize transition-colors ${
                statusFilter === s ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {s === 'all' ? `All (${bookings.length})` :
               s === 'unpaid' ? `Unpaid (${stats.unpaid})` :
               s === 'partial' ? `Partial (${stats.partial})` :
               `Paid (${stats.paid})`}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-44 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
          <Input
            placeholder="Search name, flat, email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center gap-2 justify-center py-12 text-zinc-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading bookings…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-zinc-400">
          <AlertCircle className="w-8 h-8" />
          <p className="text-sm">{bookings.length === 0 ? 'No submitted bookings for this slab' : 'No bookings match the filter'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto border rounded-xl">
          <Table>
            <TableHeader>
              <TableRow className="bg-zinc-50">
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Serial</TableHead>
                <TableHead className="font-semibold">Applicant</TableHead>
                <TableHead className="font-semibold">Flat</TableHead>
                <TableHead className="font-semibold">Email</TableHead>
                <TableHead className="font-semibold text-right">Slab Due</TableHead>
                <TableHead className="font-semibold text-right">Received</TableHead>
                <TableHead className="font-semibold text-right">Balance</TableHead>
                <TableHead className="font-semibold">Last Reminder</TableHead>
                <TableHead className="font-semibold">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((b) => {
                const ps = payStatus(b)
                const balance = b.amount_due - b.amount_received
                const wasSent = sentIds.has(b.id) || !!b.last_reminder_sent_at
                return (
                  <TableRow key={b.id} className={ps === 'unpaid' ? 'bg-red-50/30' : ps === 'partial' ? 'bg-amber-50/30' : ''}>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs font-medium ${STATUS_BADGE[ps]}`}>
                        {ps.charAt(0).toUpperCase() + ps.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">{b.serial_display || '—'}</Badge>
                    </TableCell>
                    <TableCell className="font-medium text-sm">{b.applicant_name || '—'}</TableCell>
                    <TableCell className="font-mono text-sm text-zinc-600">{b.unit_no || '—'}</TableCell>
                    <TableCell className="text-sm text-zinc-500 max-w-[160px] truncate">
                      {b.applicant_email || <span className="text-zinc-300 italic text-xs">no email</span>}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold">{fmt(b.amount_due)}</TableCell>
                    <TableCell className="text-right text-sm">
                      {b.amount_received > 0
                        ? <span className="text-green-700 font-semibold">{fmt(b.amount_received)}</span>
                        : <span className="text-zinc-300">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {balance > 0
                        ? <span className="text-red-600 font-medium">{fmt(balance)}</span>
                        : <span className="text-green-600">Nil</span>}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {b.last_reminder_sent_at
                        ? format(new Date(b.last_reminder_sent_at), 'dd MMM yy, h:mm a')
                        : <span className="text-zinc-300">Never</span>}
                    </TableCell>
                    <TableCell>
                      {ps === 'paid' ? (
                        <div className="flex items-center gap-1 text-green-600 text-xs font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Paid
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant={wasSent ? 'outline' : 'default'}
                          className="gap-1.5 h-8 text-xs"
                          disabled={sendingId === b.id || !b.applicant_email}
                          onClick={() => handleSend(b.id)}
                          title={!b.applicant_email ? 'No email address on booking' : undefined}
                        >
                          {sendingId === b.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : wasSent ? (
                            <MailCheck className="w-3.5 h-3.5" />
                          ) : (
                            <Mail className="w-3.5 h-3.5" />
                          )}
                          {wasSent ? 'Resend' : 'Send Reminder'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Main exported component
// ─────────────────────────────────────────────────────────
export function PaymentReminderClient() {
  const [slabs, setSlabs] = useState<SlabWithStats[]>([])
  const [loadingSlabs, setLoadingSlabs] = useState(true)
  const [selectedSlab, setSelectedSlab] = useState<SlabWithStats | null>(null)

  useEffect(() => {
    getSlabsWithStats().then((data) => {
      setSlabs(data)
      setLoadingSlabs(false)
    })
  }, [])

  return (
    <Card className="border-zinc-200 shadow-sm">
      <CardHeader>
        <CardTitle>{selectedSlab ? 'Payment Reminders' : 'Payment Milestones'}</CardTitle>
        <p className="text-sm text-zinc-500">
          {selectedSlab
            ? 'Send payment reminder emails to customers for this slab.'
            : 'Select a milestone to view payment status and send reminders.'}
        </p>
      </CardHeader>
      <CardContent>
        {selectedSlab ? (
          <SlabDetail slab={selectedSlab} onBack={() => setSelectedSlab(null)} />
        ) : (
          <SlabList slabs={slabs} loading={loadingSlabs} onSelect={setSelectedSlab} />
        )}
      </CardContent>
    </Card>
  )
}
