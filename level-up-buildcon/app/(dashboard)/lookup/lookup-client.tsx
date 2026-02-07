'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, Phone, Building2, Eye, Download, FileText } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

interface SearchResult {
  id: string
  serial_display: string
  applicant_name: string
  applicant_mobile: string
  project_name: string
  unit_no: string
  booking_amount_paid: number
  status: string
}

export function LookupClient() {
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [searched, setSearched] = useState(false)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!searchTerm.trim()) {
      toast.error('Please enter a search term')
      return
    }

    setLoading(true)
    setSearched(true)

    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('bookings')
        .select('id, serial_display, applicant_name, applicant_mobile, project_name, unit_no, booking_amount_paid, status')
        .neq('status', 'DRAFT')
        .or(`serial_display.ilike.%${searchTerm}%,applicant_name.ilike.%${searchTerm}%,applicant_mobile.ilike.%${searchTerm}%`)
        .order('submitted_at', { ascending: false })
        .limit(20)

      if (error) {
        throw error
      }

      setResults(data || [])
    } catch (error) {
      toast.error('Search failed', {
        description: 'Please try again',
      })
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-zinc-900 mb-2">Quick Lookup</h1>
        <p className="text-zinc-600">
          Search by serial number, purchaser name, or mobile number
        </p>
      </div>

      {/* Search Form */}
      <Card className="border-zinc-200 shadow-sm max-w-3xl mx-auto">
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-zinc-400" />
              <Input
                placeholder="Enter serial number, name, or mobile..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-11 h-12 text-base"
                disabled={loading}
              />
            </div>
            <Button type="submit" size="lg" disabled={loading}>
              {loading ? 'Searching...' : 'Search'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Results */}
      {loading && (
        <div className="space-y-3 max-w-3xl mx-auto">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border-zinc-200 shadow-sm">
              <CardContent className="py-4">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <Card className="border-zinc-200 shadow-sm p-12 text-center max-w-3xl mx-auto">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center">
              <Search className="w-8 h-8 text-zinc-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-zinc-900">No results found</h3>
              <p className="text-zinc-600 mt-1">
                Try searching with a different term
              </p>
            </div>
          </div>
        </Card>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-3 max-w-3xl mx-auto">
          <p className="text-sm text-zinc-600 mb-4">
            Found {results.length} result{results.length !== 1 ? 's' : ''}
          </p>
          {results.map((result) => (
            <Card key={result.id} className="border-zinc-200 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="py-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="font-mono">
                        {result.serial_display}
                      </Badge>
                      <Badge 
                        variant={result.status === 'SUBMITTED' ? 'default' : 'secondary'}
                        className={result.status === 'SUBMITTED' ? 'bg-green-600' : ''}
                      >
                        {result.status}
                      </Badge>
                    </div>
                    <h3 className="text-lg font-semibold text-zinc-900 mb-2">
                      {result.applicant_name}
                    </h3>
                    <div className="space-y-1 text-sm text-zinc-600">
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        {result.applicant_mobile}
                      </div>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4" />
                        {result.project_name} • Unit {result.unit_no}
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Booking Amount: {formatCurrency(result.booking_amount_paid)}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Link href={`/bookings/${result.id}`}>
                      <Button size="sm" variant="outline" className="gap-2">
                        <Eye className="w-4 h-4" />
                        View
                      </Button>
                    </Link>
                    <Button size="sm" className="gap-2">
                      <Download className="w-4 h-4" />
                      PDFs
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!searched && (
        <Card className="border-zinc-200 shadow-sm p-12 text-center max-w-3xl mx-auto">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center">
              <Search className="w-8 h-8 text-zinc-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-zinc-900">Start Searching</h3>
              <p className="text-zinc-600 mt-1">
                Enter a serial number, name, or mobile to find bookings
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
