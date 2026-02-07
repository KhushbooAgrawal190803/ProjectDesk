import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function BookingsLoading() {
  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header Skeleton */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-50">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="w-9 h-9 rounded-lg" />
            <Skeleton className="h-6 w-40" />
          </div>
          <Skeleton className="w-32 h-10 rounded-lg" />
        </div>
      </header>

      {/* Navigation Skeleton */}
      <nav className="bg-white border-b border-zinc-200">
        <div className="container mx-auto px-6">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-32 rounded-none" />
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="space-y-8">
          {/* Title */}
          <div className="space-y-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-5 w-96" />
          </div>

          {/* Search & Filters */}
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex gap-4">
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-10 w-32" />
              </div>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-8 w-24 rounded-full" />
                ))}
              </div>
            </div>
          </Card>

          {/* Table */}
          <Card className="p-6">
            <div className="space-y-4">
              {/* Table Header */}
              <div className="grid grid-cols-8 gap-4 pb-3 border-b border-zinc-200">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
              {/* Table Rows */}
              {[1, 2, 3, 4, 5, 6, 7, 8].map((row) => (
                <div key={row} className="grid grid-cols-8 gap-4 py-3 border-b border-zinc-100">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((col) => (
                    <Skeleton key={col} className="h-4 w-full" />
                  ))}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </main>
    </div>
  )
}
