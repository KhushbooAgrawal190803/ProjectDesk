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
        throw new Error('Failed to download PDFs')
      }

      // Create a blob from the response
      const blob = await response.blob()

      // Create a temporary URL for the blob
      const url = window.URL.createObjectURL(blob)

      // Create a temporary anchor element and click it to trigger download
      const link = document.createElement('a')
      link.href = url
      link.download = `${serialDisplay}_Bookings.zip`
      document.body.appendChild(link)
      link.click()

      // Clean up
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      toast.success('PDFs downloaded successfully')
    } catch (error) {
      console.error('Download error:', error)
      toast.error('Failed to download PDFs')
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
