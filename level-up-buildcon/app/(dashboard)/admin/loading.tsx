import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function AdminLoading() {
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
            {[1, 2, 3, 4, 5, 6].map((i) => (
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
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-5 w-96" />
          </div>

          {/* Stats Cards */}
          <div className="grid gap-6 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-6">
                <Skeleton className="h-4 w-32 mb-3" />
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-40" />
              </Card>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-zinc-200 pb-2">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
          </div>

          {/* Users Table */}
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-6">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-10 w-36" />
              </div>
              
              {/* Table Header */}
              <div className="grid grid-cols-6 gap-4 pb-3 border-b border-zinc-200">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
              
              {/* Table Rows */}
              {[1, 2, 3, 4, 5, 6, 7].map((row) => (
                <div key={row} className="grid grid-cols-6 gap-4 py-4 border-b border-zinc-100">
                  {[1, 2, 3, 4, 5, 6].map((col) => (
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
