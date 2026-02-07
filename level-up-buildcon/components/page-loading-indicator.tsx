'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Loader2 } from 'lucide-react'

let previousPath = ''

export function PageLoadingIndicator() {
  const pathname = usePathname()
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    // Only show loading if path actually changed
    if (previousPath !== '' && previousPath !== pathname) {
      setIsLoading(true)
      
      // Keep loading for minimum 300ms to ensure it's visible
      const timer = setTimeout(() => {
        setIsLoading(false)
      }, 300)

      return () => clearTimeout(timer)
    }
    
    previousPath = pathname
  }, [pathname])

  if (!isLoading) return null

  return (
    <>
      {/* Full screen subtle overlay */}
      <div 
        className="fixed inset-0 bg-white/60 backdrop-blur-sm z-[9998] animate-in fade-in duration-100"
        style={{ pointerEvents: 'none' }}
      />
      
      {/* Loading indicator */}
      <div 
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] animate-in fade-in zoom-in-95 duration-150"
        style={{ pointerEvents: 'none' }}
      >
        <div className="bg-zinc-900 text-white rounded-lg shadow-2xl px-6 py-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium">Loading...</span>
        </div>
      </div>
    </>
  )
}
