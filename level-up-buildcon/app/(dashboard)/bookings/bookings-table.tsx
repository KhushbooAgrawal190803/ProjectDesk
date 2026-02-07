'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Booking, Profile, UserRole } from '@/lib/types/database'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
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
import { Search, Download, Eye, Filter, X, FileText } from 'lucide-react'
import { format } from 'date-fns'

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
}

export function BookingsTable({ bookings, filterOptions, currentRole }: BookingsTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '')
  const [showFilters, setShowFilters] = useState(false)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams(searchParams.toString())
    if (searchTerm) {
      params.set('search', searchTerm)
    } else {
      params.delete('search')
    }
    router.push(`/bookings?${params.toString()}`)
  }

  const handleFilterChange = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.push(`/bookings?${params.toString()}`)
  }

  const clearFilters = () => {
    setSearchTerm('')
    router.push('/bookings')
  }

  const hasActiveFilters = searchParams.toString().length > 0

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUBMITTED':
        return <Badge variant="default" className="bg-green-600">Submitted</Badge>
      case 'EDITED':
        return <Badge variant="secondary">Edited</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

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
      {/* Search and Filter Bar */}
      <Card className="border-zinc-200 shadow-sm p-4">
        <div className="space-y-4">
          <div className="flex gap-2">
            <form onSubmit={handleSearch} className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <Input
                  placeholder="Search by serial, name, or mobile..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button type="submit">Search</Button>
            </form>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <Filter className="w-4 h-4" />
              Filters
            </Button>
            {hasActiveFilters && (
              <Button variant="ghost" onClick={clearFilters} className="gap-2">
                <X className="w-4 h-4" />
                Clear
              </Button>
            )}
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t border-zinc-200">
              <div>
                <Select
                  value={searchParams.get('project') || ''}
                  onValueChange={(v) => handleFilterChange('project', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Projects</SelectItem>
                    {filterOptions.projects.map((project) => (
                      <SelectItem key={project} value={project}>
                        {project}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Select
                  value={searchParams.get('status') || ''}
                  onValueChange={(v) => handleFilterChange('status', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Status</SelectItem>
                    <SelectItem value="SUBMITTED">Submitted</SelectItem>
                    <SelectItem value="EDITED">Edited</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Select
                  value={searchParams.get('payment_mode') || ''}
                  onValueChange={(v) => handleFilterChange('payment_mode', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Payment Modes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Payment Modes</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                    <SelectItem value="NEFT_RTGS">NEFT / RTGS</SelectItem>
                    <SelectItem value="UPI">UPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Select
                  value={searchParams.get('created_by') || ''}
                  onValueChange={(v) => handleFilterChange('created_by', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Staff" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Staff</SelectItem>
                    {filterOptions.users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Input
                  type="date"
                  value={searchParams.get('from_date') || ''}
                  onChange={(e) => handleFilterChange('from_date', e.target.value)}
                  placeholder="From Date"
                />
              </div>

              <div>
                <Input
                  type="date"
                  value={searchParams.get('to_date') || ''}
                  onChange={(e) => handleFilterChange('to_date', e.target.value)}
                  placeholder="To Date"
                />
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Results */}
      <div className="text-sm text-zinc-600">
        Showing {bookings.length} booking{bookings.length !== 1 ? 's' : ''}
      </div>

      {bookings.length === 0 ? (
        <Card className="border-zinc-200 shadow-sm p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center">
              <Search className="w-8 h-8 text-zinc-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-zinc-900">No results found</h3>
              <p className="text-zinc-600 mt-1">Try adjusting your search or filters</p>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="border-zinc-200 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-zinc-50">
                <TableHead className="font-semibold">Serial</TableHead>
                <TableHead className="font-semibold">Purchaser</TableHead>
                <TableHead className="font-semibold">Phone</TableHead>
                <TableHead className="font-semibold">Project</TableHead>
                <TableHead className="font-semibold">Unit</TableHead>
                <TableHead className="font-semibold">Booking Amount</TableHead>
                <TableHead className="font-semibold">Payment</TableHead>
                <TableHead className="font-semibold">Created By</TableHead>
                <TableHead className="font-semibold">Date</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookings.map((booking) => (
                <TableRow key={booking.id} className="hover:bg-zinc-50">
                  <TableCell>
                    <Badge variant="outline" className="font-mono">
                      {booking.serial_display}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{booking.applicant_name}</TableCell>
                  <TableCell className="text-zinc-600">{booking.applicant_mobile}</TableCell>
                  <TableCell className="text-zinc-600">{booking.project_name}</TableCell>
                  <TableCell className="text-zinc-600">{booking.unit_no}</TableCell>
                  <TableCell className="font-medium">
                    {formatCurrency(booking.booking_amount_paid)}
                  </TableCell>
                  <TableCell className="text-zinc-600">
                    {booking.payment_mode.replace('_', ' / ')}
                  </TableCell>
                  <TableCell className="text-zinc-600 text-sm">
                    {booking.creator?.full_name}
                  </TableCell>
                  <TableCell className="text-zinc-600 text-sm">
                    {booking.submitted_at && format(new Date(booking.submitted_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell>{getStatusBadge(booking.status)}</TableCell>
                  <TableCell>
                    <Link href={`/bookings/${booking.id}`}>
                      <Button variant="ghost" size="sm">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}

