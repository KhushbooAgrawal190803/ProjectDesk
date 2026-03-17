'use client'

import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

interface DownloadPDFsButtonProps {
  bookingId: string
  serialDisplay: string
}

export function DownloadPDFsButton({ bookingId, serialDisplay }: DownloadPDFsButtonProps) {
  const [isLoading, setIsLoading] = useState(false)

  async function handleDownload() {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/bookings/${bookingId}/download`)

      if (!response.ok) {
        let message = 'Failed to download PDFs'
        try {
          const body = await response.json().catch(() => null)
          if (body?.error) message = body.error
          else if (response.status === 404) message = 'Booking not found'
          else if (response.status >= 500) message = 'Server error generating PDFs'
          else if (response.status === 302 || response.status === 401) message = 'Please sign in again'
        } catch {
          if (response.status === 404) message = 'Booking not found'
          else if (response.status >= 500) message = 'Server error generating PDFs'
        }
        throw new Error(message)
      }

      // Create a blob from the response
      const blob = await response.blob()

      // Create a temporary URL for the blob
      const url = window.URL.createObjectURL(blob)

      // Create a temporary anchor element and click it to trigger download
      const link = document.createElement('a')
      link.href = url
      link.download = `${serialDisplay.replace(/\//g, '_')}_Bookings.zip`
      document.body.appendChild(link)
      link.click()

      // Clean up
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      toast.success('PDFs downloaded successfully')
    } catch (error) {
      console.error('Download error:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to download PDFs')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button 
      variant="outline" 
      className="gap-2"
      onClick={handleDownload}
      disabled={isLoading}
    >
      <Download className="w-4 h-4" />
      {isLoading ? 'Downloading...' : 'Download PDFs'}
    </Button>
  )
}
