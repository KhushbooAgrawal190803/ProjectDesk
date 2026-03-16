'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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
import { Badge } from '@/components/ui/badge'
import { getPaymentSlabs, getBookingsForSlab, setSlabPayment } from './payment-slab-actions'
import { toast } from 'sonner'
import { IndianRupee, Loader2, Check, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)

export function PaymentScheduleClient() {
  const [slabs, setSlabs] = useState<{ id: number; sr_no: number; label: string; percentage: number }[]>([])
  const [selectedSlabId, setSelectedSlabId] = useState<string>('')
  const [slabData, setSlabData] = useState<{
    slab: { id: number; label: string; percentage: number } | null
    bookings: Array<{
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
    }>
  }>({ slab: null, bookings: [] })
  const [loadingSlabs, setLoadingSlabs] = useState(true)
  const [loadingSlab, setLoadingSlab] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [inputValues, setInputValues] = useState<Record<string, string>>({})
  const [receivedDates, setReceivedDates] = useState<Record<string, string>>({})

  useEffect(() => {
    getPaymentSlabs().then((data) => {
      setSlabs(data as any)
      setLoadingSlabs(false)
    })
  }, [])

  useEffect(() => {
    if (!selectedSlabId) {
      setSlabData({ slab: null, bookings: [] })
      return
    }
    setLoadingSlab(true)
    getBookingsForSlab(Number(selectedSlabId))
      .then((res) => {
        setSlabData(res)
        const initial: Record<string, string> = {}
        const dates: Record<string, string> = {}
        res.bookings.forEach((b: any) => {
          initial[b.id] = b.amount_received > 0 ? String(b.amount_received) : ''
          dates[b.id] = b.received_at ? b.received_at.slice(0, 10) : ''
        })
        setInputValues(initial)
        setReceivedDates(dates)
      })
      .finally(() => setLoadingSlab(false))
  }, [selectedSlabId])

  const handleSave = async (bookingId: string) => {
    const raw = inputValues[bookingId]?.replace(/,/g, '').trim()
    const amount = raw ? parseFloat(raw) : 0
    if (isNaN(amount) || amount < 0) {
      toast.error('Enter a valid amount')
      return
    }
    setSavingId(bookingId)
    try {
      await setSlabPayment(
        bookingId,
        Number(selectedSlabId),
        amount,
        receivedDates[bookingId] || undefined
      )
      toast.success('Amount saved')
      const res = await getBookingsForSlab(Number(selectedSlabId))
      setSlabData(res)
      const next: Record<string, string> = {}
      const nextDates: Record<string, string> = {}
      res.bookings.forEach((b: any) => {
        next[b.id] = b.amount_received > 0 ? String(b.amount_received) : ''
        nextDates[b.id] = b.received_at ? b.received_at.slice(0, 10) : ''
      })
      setInputValues(next)
      setReceivedDates(nextDates)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <Card className="border-zinc-200 shadow-sm">
      <CardHeader>
        <CardTitle>Payment schedule by slab</CardTitle>
        <p className="text-sm text-zinc-600">
          Select a slab to see who has paid and who has not. Enter amount received and save.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <Label className="shrink-0">Schedule / Slab</Label>
          <Select value={selectedSlabId} onValueChange={setSelectedSlabId} disabled={loadingSlabs}>
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Select a slab..." />
            </SelectTrigger>
            <SelectContent>
              {slabs.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  Sr. {s.sr_no} — {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loadingSlab && (
          <div className="flex items-center gap-2 text-zinc-500 py-8">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading...
          </div>
        )}

        {!loadingSlab && selectedSlabId && slabData.slab && (
          <>
            <p className="text-sm text-zinc-600">
              Slab: <strong>{slabData.slab.label}</strong> ({slabData.slab.percentage}% of total cost)
            </p>
            {slabData.bookings.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-zinc-500">
                <AlertCircle className="w-8 h-8" />
                <p>No submitted bookings</p>
              </div>
            ) : (
              <div className="overflow-x-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-zinc-50">
                      <TableHead className="font-semibold">Serial</TableHead>
                      <TableHead className="font-semibold">Applicant</TableHead>
                      <TableHead className="font-semibold">Unit</TableHead>
                      <TableHead className="font-semibold text-right">Total cost</TableHead>
                      <TableHead className="font-semibold text-right">Slab due</TableHead>
                      <TableHead className="font-semibold text-right">Received</TableHead>
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {slabData.bookings.map((b) => (
                      <TableRow key={b.id} className="hover:bg-zinc-50">
                        <TableCell>
                          <Badge variant="outline" className="font-mono">
                            {b.serial_display || '-'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{b.applicant_name || '-'}</TableCell>
                        <TableCell className="text-zinc-600">{b.unit_no || '-'}</TableCell>
                        <TableCell className="text-right">{formatCurrency(b.total_cost || 0)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(b.amount_due)}
                        </TableCell>
                        <TableCell className="text-right">
                          {b.amount_received > 0 ? (
                            <span className="text-green-700 font-medium">
                              {formatCurrency(b.amount_received)}
                            </span>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {b.received_at
                            ? format(new Date(b.received_at), 'dd MMM yyyy')
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <Input
                              type="number"
                              placeholder="Amount"
                              className="w-28 h-9"
                              value={inputValues[b.id] ?? ''}
                              onChange={(e) =>
                                setInputValues((prev) => ({ ...prev, [b.id]: e.target.value }))
                              }
                            />
                            <Input
                              type="date"
                              className="w-36 h-9"
                              value={receivedDates[b.id] ?? ''}
                              onChange={(e) =>
                                setReceivedDates((prev) => ({ ...prev, [b.id]: e.target.value }))
                              }
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              disabled={savingId === b.id}
                              onClick={() => handleSave(b.id)}
                            >
                              {savingId === b.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Check className="w-4 h-4" />
                              )}
                              Save
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
