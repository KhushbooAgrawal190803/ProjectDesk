'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Booking, Profile, UserRole } from '@/lib/types/database'
import { formatInr } from '@/lib/booking/money'
import { formatPersonName } from '@/lib/booking/person'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { DateField } from '@/components/ui/date-field'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BookingStatusBadge, PaymentStandingBadge } from '@/components/booking/status-badge'
import { Search, Filter, X, FileText, ChevronDown, ChevronUp } from 'lucide-react'
import { format } from 'date-fns'
import type { BookingMoney } from './page'

interface BookingWithCreator extends Booking {
  creator: Profile
}

interface BookingsTableProps {
  bookings: BookingWithCreator[]
  filterOptions: {
    projects: string[]
    users: { id: string; full_name: string }[]
  }
  currentRole: UserRole
  money: Record<string, BookingMoney>
}

const FILTER_KEYS = ['project', 'unit_category', 'status', 'payment_mode', 'created_by', 'from_date', 'to_date']

export function BookingsTable({ bookings, filterOptions, money }: BookingsTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '')
  const activeFilterCount = FILTER_KEYS.filter((key) => searchParams.get(key)).length
  const [showFilters, setShowFilters] = useState(activeFilterCount > 0)

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams(searchParams.toString())
    if (searchTerm.trim()) params.set('search', searchTerm.trim())
    else params.delete('search')
    router.push(`/bookings?${params.toString()}`)
  }

  const handleFilterChange = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== 'all') params.set(key, value)
    else params.delete(key)
    router.push(`/bookings?${params.toString()}`)
  }

  const clearFilters = () => {
    setSearchTerm('')
    router.push('/bookings')
  }

  const hasActiveFilters = searchParams.toString().length > 0

  if (bookings.length === 0 && !hasActiveFilters) {
    return (
      <Card className="border-zinc-200 shadow-sm p-12 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center">
            <FileText className="w-8 h-8 text-zinc-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">No bookings yet</h3>
            <p className="text-zinc-600 mt-1">Get started by creating your first booking</p>
          </div>
          <Link href="/new-booking">
            <Button>Create Booking</Button>
          </Link>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="border-zinc-200 shadow-sm p-4">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <form onSubmit={handleSearch} className="flex min-w-72 flex-1 gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  aria-label="Search bookings"
                  placeholder="Search serial, flat, purchaser, co-applicant or phone"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button type="submit">Search</Button>
            </form>
            <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="gap-2" aria-expanded={showFilters}>
              <Filter className="h-4 w-4" />
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            {hasActiveFilters && (
              <Button variant="ghost" onClick={clearFilters} className="gap-2">
                <X className="h-4 w-4" />
                Clear filters
              </Button>
            )}
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 gap-4 border-t border-zinc-200 pt-4 md:grid-cols-3 lg:grid-cols-4">
              <FilterSelect label="Project" value={searchParams.get('project')} onChange={(v) => handleFilterChange('project', v)} options={filterOptions.projects.filter(Boolean).map((project) => [project, project])} allLabel="All projects" />
              <FilterSelect label="Category" value={searchParams.get('unit_category')} onChange={(v) => handleFilterChange('unit_category', v)} options={[['Residential', 'Residential'], ['Commercial', 'Commercial']]} allLabel="All categories" />
              <FilterSelect label="Booking status" value={searchParams.get('status')} onChange={(v) => handleFilterChange('status', v)} options={[['PENDING', 'Awaiting approval'], ['SUBMITTED', 'Submitted'], ['EDITED', 'Edited']]} allLabel="All statuses" />
              <FilterSelect label="Booking payment mode" value={searchParams.get('payment_mode')} onChange={(v) => handleFilterChange('payment_mode', v)} options={[['Cash', 'Cash'], ['Cheque', 'Cheque'], ['NEFT_RTGS', 'NEFT / RTGS'], ['UPI', 'UPI'], ['Other', 'Other']]} allLabel="All modes" />
              <FilterSelect label="Created by" value={searchParams.get('created_by')} onChange={(v) => handleFilterChange('created_by', v)} options={filterOptions.users.filter((user) => user.id).map((user) => [user.id, user.full_name])} allLabel="All users" />
              <div className="space-y-1.5">
                <Label htmlFor="from_date" className="text-xs text-zinc-500">Booked from</Label>
                <DateField id="from_date" value={searchParams.get('from_date') || ''} onChange={(value) => handleFilterChange('from_date', value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="to_date" className="text-xs text-zinc-500">To</Label>
                <DateField id="to_date" value={searchParams.get('to_date') || ''} onChange={(value) => handleFilterChange('to_date', value)} />
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="text-sm text-zinc-600">
        {hasActiveFilters ? `${bookings.length} matching booking${bookings.length !== 1 ? 's' : ''}` : `Showing ${bookings.length} booking${bookings.length !== 1 ? 's' : ''}`}
      </div>

      {bookings.length === 0 ? (
        <Card className="border-zinc-200 shadow-sm p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center">
              <Search className="w-8 h-8 text-zinc-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-zinc-900">No bookings match</h3>
              <p className="text-zinc-600 mt-1">Try a different search, or clear the filters.</p>
            </div>
            <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden border-zinc-200 shadow-sm">
          <div className="overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow className="bg-zinc-50">
                  <TableHead className="font-semibold">Serial</TableHead>
                  <TableHead className="font-semibold">Purchaser</TableHead>
                  <TableHead className="font-semibold">Flat</TableHead>
                  <TableHead className="text-right font-semibold">Consideration</TableHead>
                  <TableHead className="text-right font-semibold">Received</TableHead>
                  <TableHead className="font-semibold">Payment</TableHead>
                  <TableHead className="font-semibold">Booking</TableHead>
                  <TableHead className="font-semibold">Booked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((booking) => {
                  const row = money[booking.id]
                  return (
                    <TableRow key={booking.id} className="cursor-pointer hover:bg-zinc-50" onClick={() => router.push(`/bookings/${booking.id}`)}>
                      <TableCell>
                        <Link href={`/bookings/${booking.id}`} onClick={(event) => event.stopPropagation()}>
                          <Badge variant="outline" className="font-mono">{booking.serial_display || '—'}</Badge>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-zinc-900">
                          {formatPersonName(booking.applicant_salutation, booking.applicant_name)}
                          {row?.coapplicants ? <span className="ml-1 text-xs font-normal text-zinc-500">+{row.coapplicants}</span> : null}
                        </p>
                        <p className="text-xs text-zinc-500">{booking.applicant_mobile}</p>
                      </TableCell>
                      <TableCell className="text-zinc-700">
                        {booking.unit_no}
                        <div className="text-xs text-zinc-500">{booking.project_name}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row ? formatInr(row.consideration) : '—'}
                        {row && <div className="text-xs text-zinc-500">+ GST {formatInr(row.considerationGst)}</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row ? formatInr(row.receivedPrincipal) : '—'}
                        {row && <div className="text-xs text-zinc-500">+ GST {formatInr(row.receivedGst)}</div>}
                      </TableCell>
                      <TableCell>{row && <PaymentStandingBadge standing={row.standing} />}</TableCell>
                      <TableCell><BookingStatusBadge status={booking.status} /></TableCell>
                      <TableCell className="text-sm text-zinc-600">
                        {booking.submitted_at && format(new Date(booking.submitted_at), 'd MMM yyyy')}
                        <div className="text-xs text-zinc-400">{booking.creator?.full_name}</div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string
  value: string | null
  onChange: (value: string) => void
  options: Array<[string, string]>
  allLabel: string
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-zinc-500">{label}</Label>
      <Select value={value || 'all'} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue placeholder={allLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{allLabel}</SelectItem>
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>{optionLabel}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
