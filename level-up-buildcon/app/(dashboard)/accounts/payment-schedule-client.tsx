'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getPaymentSlabs, getBookingsForSlab, setSlabPayment } from './payment-slab-actions'
import { toast } from 'sonner'
import {
  IndianRupee,
  Loader2,
  Check,
  AlertCircle,
  Search,
  X,
  TrendingDown,
  TrendingUp,
  CircleDollarSign,
} from 'lucide-react'
import { format } from 'date-fns'

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)

type PaymentStatus = 'all' | 'unpaid' | 'paid' | 'partial'

interface BookingRow {
  id: string
  serial_display?: string
  applicant_name?: string
  unit_no?: string
  project_name?: string
  total_cost?: number
  amount_due: number
  amount_received: number
  received_at?: string | null
  notes?: string | null
}

function getPaymentStatus(b: BookingRow): 'paid' | 'partial' | 'unpaid' {
  if (b.amount_received <= 0) return 'unpaid'
  if (b.amount_received >= b.amount_due) return 'paid'
  return 'partial'
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  paid:    { label: 'Paid',    className: 'bg-green-100 text-green-800 border-green-200' },
  partial: { label: 'Partial', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  unpaid:  { label: 'Unpaid',  className: 'bg-red-100 text-red-700 border-red-200' },
}

const ROW_BG: Record<string, string> = {
  paid:    '',
  partial: 'bg-amber-50/40',
  unpaid:  'bg-red-50/40',
}

export function PaymentScheduleClient() {
  const [slabs, setSlabs] = useState<{ id: number; sr_no: number; label: string; percentage: number }[]>([])
  const [selectedSlabId, setSelectedSlabId] = useState<string>('')
  const [slabData, setSlabData] = useState<{ slab: { id: number; label: string; percentage: number } | null; bookings: BookingRow[] }>({ slab: null, bookings: [] })
  const [loadingSlabs, setLoadingSlabs] = useState(true)
  const [loadingSlab, setLoadingSlab] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [inputValues, setInputValues] = useState<Record<string, string>>({})
  const [receivedDates, setReceivedDates] = useState<Record<string, string>>({})
  const [notesValues, setNotesValues] = useState<Record<string, string>>({})

  // Filters
  const [statusFilter, setStatusFilter] = useState<PaymentStatus>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    getPaymentSlabs().then((data) => {
      setSlabs(data as any)
      setLoadingSlabs(false)
    })
  }, [])

  const loadSlab = (slabId: string) => {
    if (!slabId) { setSlabData({ slab: null, bookings: [] }); return }
    setLoadingSlab(true)
    getBookingsForSlab(Number(slabId))
      .then((res) => {
        setSlabData(res as any)
        const inputs: Record<string, string> = {}
        const dates: Record<string, string> = {}
        const notes: Record<string, string> = {}
        res.bookings.forEach((b: any) => {
          inputs[b.id] = b.amount_received > 0 ? String(b.amount_received) : ''
          dates[b.id] = b.received_at ? b.received_at.slice(0, 10) : ''
          notes[b.id] = b.notes || ''
        })
        setInputValues(inputs)
        setReceivedDates(dates)
        setNotesValues(notes)
      })
      .finally(() => setLoadingSlab(false))
  }

  useEffect(() => { loadSlab(selectedSlabId) }, [selectedSlabId])

  const handleSave = async (bookingId: string) => {
    const raw = inputValues[bookingId]?.replace(/,/g, '').trim()
    const amount = raw ? parseFloat(raw) : 0
    if (isNaN(amount) || amount < 0) { toast.error('Enter a valid amount'); return }
    setSavingId(bookingId)
    try {
      await setSlabPayment(bookingId, Number(selectedSlabId), amount, receivedDates[bookingId] || undefined, notesValues[bookingId] || undefined)
      toast.success('Payment saved')
      loadSlab(selectedSlabId)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save')
    } finally {
      setSavingId(null)
    }
  }

  // Derived stats for selected slab
  const stats = useMemo(() => {
    const bs = slabData.bookings
    const totalDue = bs.reduce((s, b) => s + b.amount_due, 0)
    const totalReceived = bs.reduce((s, b) => s + b.amount_received, 0)
    const unpaidCount = bs.filter(b => getPaymentStatus(b) === 'unpaid').length
    const paidCount = bs.filter(b => getPaymentStatus(b) === 'paid').length
    const partialCount = bs.filter(b => getPaymentStatus(b) === 'partial').length
    return { totalDue, totalReceived, outstanding: totalDue - totalReceived, unpaidCount, paidCount, partialCount }
  }, [slabData.bookings])

  // Filtered rows
  const filtered = useMemo(() => {
    let rows = slabData.bookings
    if (statusFilter !== 'all') rows = rows.filter(b => getPaymentStatus(b) === statusFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(b =>
        b.applicant_name?.toLowerCase().includes(q) ||
        b.unit_no?.toLowerCase().includes(q) ||
        b.serial_display?.toLowerCase().includes(q)
      )
    }
    return rows
  }, [slabData.bookings, statusFilter, search])

  return (
    <Card className="border-zinc-200 shadow-sm">
      <CardHeader>
        <CardTitle>Payment Schedule — Slabs</CardTitle>
        <p className="text-sm text-zinc-500">Select a slab to view and record payments for each booking.</p>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Slab selector */}
        <div className="flex flex-wrap items-center gap-3">
          <Label className="shrink-0 text-sm font-medium">Slab</Label>
          <Select value={selectedSlabId} onValueChange={setSelectedSlabId} disabled={loadingSlabs}>
            <SelectTrigger className="w-full max-w-lg">
              <SelectValue placeholder={loadingSlabs ? 'Loading slabs…' : 'Select a payment slab…'} />
            </SelectTrigger>
            <SelectContent>
              {slabs.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.sr_no}. {s.label} <span className="text-zinc-400 ml-1">({s.percentage}%)</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loadingSlab && (
          <div className="flex items-center gap-2 text-zinc-500 py-10 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading…
          </div>
        )}

        {!loadingSlab && selectedSlabId && slabData.slab && (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="md:col-span-1 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <p className="text-xs text-zinc-500 mb-0.5">Total Due</p>
                <p className="text-base font-semibold text-zinc-900">{formatCurrency(stats.totalDue)}</p>
              </div>
              <div className="md:col-span-1 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                <p className="text-xs text-green-600 mb-0.5">Collected</p>
                <p className="text-base font-semibold text-green-800">{formatCurrency(stats.totalReceived)}</p>
              </div>
              <div className="md:col-span-1 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-xs text-red-500 mb-0.5">Outstanding</p>
                <p className="text-base font-semibold text-red-700">{formatCurrency(stats.outstanding)}</p>
              </div>
              <div className="md:col-span-1 rounded-xl border border-zinc-200 bg-white px-4 py-3 flex items-center gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-zinc-500">Paid</span>
                  <span className="text-base font-semibold text-green-700">{stats.paidCount}</span>
                </div>
                <div className="w-px h-8 bg-zinc-200" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-zinc-500">Partial</span>
                  <span className="text-base font-semibold text-amber-600">{stats.partialCount}</span>
                </div>
                <div className="w-px h-8 bg-zinc-200" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-zinc-500">Unpaid</span>
                  <span className="text-base font-semibold text-red-600">{stats.unpaidCount}</span>
                </div>
              </div>
              <div className="md:col-span-1 rounded-xl border border-zinc-200 bg-white px-4 py-3">
                <p className="text-xs text-zinc-500 mb-0.5">Collection rate</p>
                <p className="text-base font-semibold text-zinc-900">
                  {stats.totalDue > 0 ? Math.round((stats.totalReceived / stats.totalDue) * 100) : 0}%
                </p>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {/* Status filter tabs */}
              <div className="flex rounded-lg border border-zinc-200 overflow-hidden text-sm">
                {(['all', 'unpaid', 'partial', 'paid'] as PaymentStatus[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 font-medium capitalize transition-colors ${
                      statusFilter === s
                        ? 'bg-zinc-900 text-white'
                        : 'bg-white text-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                    {s === 'all' ? `All (${slabData.bookings.length})` :
                     s === 'unpaid' ? `Unpaid (${stats.unpaidCount})` :
                     s === 'partial' ? `Partial (${stats.partialCount})` :
                     `Paid (${stats.paidCount})`}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative flex-1 min-w-48 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                <Input
                  placeholder="Search flat, name, serial…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {filtered.length !== slabData.bookings.length && (
                <span className="text-xs text-zinc-500">{filtered.length} of {slabData.bookings.length} shown</span>
              )}
            </div>

            {/* Table */}
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-zinc-400">
                <AlertCircle className="w-8 h-8" />
                <p className="text-sm">{slabData.bookings.length === 0 ? 'No submitted bookings yet' : 'No bookings match the filter'}</p>
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
                      <TableHead className="font-semibold text-right">Total Cost</TableHead>
                      <TableHead className="font-semibold text-right">Slab Due</TableHead>
                      <TableHead className="font-semibold text-right">Received</TableHead>
                      <TableHead className="font-semibold text-right">Balance</TableHead>
                      <TableHead className="font-semibold">Rec. Date</TableHead>
                      <TableHead className="font-semibold min-w-[340px]">Record Payment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((b) => {
                      const ps = getPaymentStatus(b)
                      const badge = STATUS_BADGE[ps]
                      const balance = b.amount_due - b.amount_received
                      return (
                        <TableRow key={b.id} className={`${ROW_BG[ps]} hover:brightness-95 transition-all`}>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs font-medium ${badge.className}`}>
                              {badge.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-xs">
                              {b.serial_display || '—'}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium text-sm">{b.applicant_name || '—'}</TableCell>
                          <TableCell className="text-zinc-600 text-sm font-mono">{b.unit_no || '—'}</TableCell>
                          <TableCell className="text-right text-sm text-zinc-600">{formatCurrency(b.total_cost || 0)}</TableCell>
                          <TableCell className="text-right text-sm font-semibold">{formatCurrency(b.amount_due)}</TableCell>
                          <TableCell className="text-right text-sm">
                            {b.amount_received > 0
                              ? <span className="text-green-700 font-semibold">{formatCurrency(b.amount_received)}</span>
                              : <span className="text-zinc-300">—</span>}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {balance > 0
                              ? <span className="text-red-600 font-medium">{formatCurrency(balance)}</span>
                              : <span className="text-green-600 font-medium">Nil</span>}
                          </TableCell>
                          <TableCell className="text-sm text-zinc-500">
                            {b.received_at ? format(new Date(b.received_at), 'dd MMM yy') : '—'}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Input
                                type="number"
                                placeholder="Amount (₹)"
                                className="w-28 h-8 text-sm"
                                value={inputValues[b.id] ?? ''}
                                onChange={(e) => setInputValues((p) => ({ ...p, [b.id]: e.target.value }))}
                              />
                              <Input
                                type="date"
                                className="w-32 h-8 text-sm"
                                value={receivedDates[b.id] ?? ''}
                                onChange={(e) => setReceivedDates((p) => ({ ...p, [b.id]: e.target.value }))}
                              />
                              <Input
                                placeholder="Notes"
                                className="w-28 h-8 text-sm"
                                value={notesValues[b.id] ?? ''}
                                onChange={(e) => setNotesValues((p) => ({ ...p, [b.id]: e.target.value }))}
                              />
                              <Button
                                size="sm"
                                className="h-8 gap-1 px-3"
                                disabled={savingId === b.id}
                                onClick={() => handleSave(b.id)}
                              >
                                {savingId === b.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <Check className="w-3.5 h-3.5" />}
                                Save
                              </Button>
                            </div>
                            {b.notes && (
                              <p className="text-xs text-zinc-400 mt-1 truncate max-w-xs">{b.notes}</p>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}

        {!loadingSlab && !selectedSlabId && (
          <div className="flex flex-col items-center gap-2 py-12 text-zinc-400">
            <CircleDollarSign className="w-10 h-10" />
            <p className="text-sm">Select a slab above to get started</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
