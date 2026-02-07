import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function DownloadsLoading() {
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

          {/* Filter Card */}
          <Card className="p-6">
            <div className="space-y-4">
              <Skeleton className="h-6 w-40 mb-4" />
              <div className="grid md:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-4">
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-10 w-24" />
              </div>
            </div>
          </Card>

          {/* Results */}
          <Card className="p-6">
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between py-4 border-b border-zinc-100 last:border-0">
                  <div className="flex items-center gap-4">
                    <Skeleton className="w-10 h-10 rounded" />
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-64" />
                      <Skeleton className="h-4 w-48" />
                    </div>
                  </div>
                  <Skeleton className="h-9 w-28" />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </main>
    </div>
  )
}
