import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function NewBookingLoading() {
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
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Title */}
          <div className="space-y-2">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-5 w-96" />
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-between">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-full" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>

          {/* Form Card */}
          <Card className="p-8">
            <div className="space-y-6">
              <Skeleton className="h-7 w-48 mb-8" />
              
              {/* Form Fields */}
              <div className="grid md:grid-cols-2 gap-6">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ))}
              </div>

              {/* Buttons */}
              <div className="flex justify-between pt-6">
                <Skeleton className="h-10 w-24" />
                <div className="flex gap-3">
                  <Skeleton className="h-10 w-32" />
                  <Skeleton className="h-10 w-24" />
                </div>
              </div>
            </div>
          </Card>
        </div>
      </main>
    </div>
  )
}
