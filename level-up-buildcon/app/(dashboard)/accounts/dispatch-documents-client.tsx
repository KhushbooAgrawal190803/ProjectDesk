'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Upload, FileText, Clock, CheckCircle2, XCircle, Send, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { uploadDispatchDocument } from './dispatch-actions'
import { DispatchDocumentWithDetails } from '@/lib/types/database'

interface Booking {
  id: string
  serial_display?: string
  applicant_name?: string
  applicant_mobile?: string
  applicant_email?: string
  unit_no?: string
  project_name?: string
}

interface DispatchDocumentsClientProps {
  bookings: Booking[]
  dispatches: DispatchDocumentWithDetails[]
  isAdmin: boolean
}

export function DispatchDocumentsClient({ bookings, dispatches, isAdmin }: DispatchDocumentsClientProps) {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedBookingId, setSelectedBookingId] = useState('')
  const [copyType, setCopyType] = useState<'customer' | 'company'>('customer')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedBooking = bookings.find(b => b.id === selectedBookingId)

  const handleBookingSelect = (bookingId: string) => {
    setSelectedBookingId(bookingId)
    const booking = bookings.find(b => b.id === bookingId)
    if (booking) {
      setRecipientEmail(booking.applicant_email || '')
      setRecipientPhone(booking.applicant_mobile || '')
    }
  }

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0]
    if (!file || !selectedBookingId) {
      toast.error('Please select a booking and file')
      return
    }

    if (!file.type.includes('pdf') && !file.type.includes('image')) {
      toast.error('Only PDF and image files are allowed')
      return
    }

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('bookingId', selectedBookingId)
      formData.append('copyType', copyType)
      formData.append('file', file)
      formData.append('recipientEmail', recipientEmail)
      formData.append('recipientPhone', recipientPhone)

      await uploadDispatchDocument(formData)
      toast.success('Document uploaded', {
        description: 'Sent to admin for approval before dispatch.',
      })
      setUploadDialogOpen(false)
      resetForm()
    } catch (error: any) {
      toast.error('Upload failed', { description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setSelectedBookingId('')
    setCopyType('customer')
    setRecipientEmail('')
    setRecipientPhone('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="w-3 h-3" />
            Pending Approval
          </Badge>
        )
      case 'APPROVED':
        return (
          <Badge variant="default" className="bg-blue-600 gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Approved
          </Badge>
        )
      case 'SENT':
        return (
          <Badge variant="default" className="bg-green-600 gap-1">
            <Send className="w-3 h-3" />
            Sent
          </Badge>
        )
      case 'REJECTED':
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="w-3 h-3" />
            Rejected
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Document Dispatch</h3>
          <p className="text-sm text-zinc-500">Upload sealed & signed copies for dispatch via Email & WhatsApp</p>
        </div>
        <Button onClick={() => setUploadDialogOpen(true)} className="gap-2">
          <Upload className="w-4 h-4" />
          Upload Document
        </Button>
      </div>

      {/* Dispatches Table */}
      {dispatches.length === 0 ? (
        <Card className="border-zinc-200 shadow-sm">
          <CardContent className="py-12">
            <div className="text-center">
              <FileText className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
              <p className="text-zinc-500 font-medium">No dispatch documents yet</p>
              <p className="text-sm text-zinc-400 mt-1">Upload sealed & signed booking copies to dispatch them</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-zinc-200 shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-zinc-50">
                    <TableHead className="font-semibold">Booking</TableHead>
                    <TableHead className="font-semibold">Copy Type</TableHead>
                    <TableHead className="font-semibold">File</TableHead>
                    <TableHead className="font-semibold">Recipient</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Uploaded</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dispatches.map((doc: any) => (
                    <TableRow key={doc.id} className="hover:bg-zinc-50">
                      <TableCell>
                        <div>
                          <Badge variant="outline" className="font-mono text-xs">
                            {doc.booking?.serial_display || '-'}
                          </Badge>
                          <p className="text-xs text-zinc-500 mt-1">{doc.booking?.applicant_name}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={doc.copy_type === 'customer' ? 'default' : 'secondary'} className={doc.copy_type === 'customer' ? 'bg-blue-600' : ''}>
                          {doc.copy_type === 'customer' ? 'Customer Copy' : 'Company Copy'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm truncate max-w-[200px]">{doc.file_name}</p>
                        {doc.file_size && (
                          <p className="text-xs text-zinc-400">{(doc.file_size / 1024).toFixed(0)} KB</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs space-y-0.5">
                          {doc.recipient_email && <p className="text-zinc-600">{doc.recipient_email}</p>}
                          {doc.recipient_phone && <p className="text-zinc-600">{doc.recipient_phone}</p>}
                          {!doc.recipient_email && !doc.recipient_phone && <span className="text-zinc-400">-</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(doc.status)}
                        {doc.rejection_reason && (
                          <p className="text-xs text-red-500 mt-1">{doc.rejection_reason}</p>
                        )}
                        {doc.status === 'SENT' && (
                          <div className="text-xs text-zinc-400 mt-1 space-y-0.5">
                            {doc.email_sent_at && <p>✉️ Email sent</p>}
                            {doc.whatsapp_sent_at && <p>💬 WhatsApp sent</p>}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-zinc-600">
                        {format(new Date(doc.created_at), 'MMM d, yyyy')}
                        <p className="text-xs text-zinc-400">by {doc.uploader?.full_name}</p>
                      </TableCell>
                      <TableCell>
                        <a
                          href={`/api/dispatch-documents/${doc.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button variant="outline" size="sm" className="gap-1">
                            <Eye className="w-3 h-3" />
                            View
                          </Button>
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Dispatch Document</DialogTitle>
            <DialogDescription>
              Upload a sealed & signed copy. Admin will approve before it is sent via email & WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Booking</Label>
              <Select value={selectedBookingId} onValueChange={handleBookingSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a booking" />
                </SelectTrigger>
                <SelectContent>
                  {bookings.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.serial_display} — {b.applicant_name || 'N/A'} ({b.unit_no})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Copy Type</Label>
              <Select value={copyType} onValueChange={(v) => setCopyType(v as 'customer' | 'company')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer Copy</SelectItem>
                  <SelectItem value="company">Company Copy</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Upload File (PDF / Image)</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Recipient Email</Label>
                <Input
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="customer@email.com"
                  type="email"
                />
              </div>
              <div className="space-y-2">
                <Label>Recipient Phone</Label>
                <Input
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>

            {selectedBooking && (
              <div className="bg-zinc-50 rounded-lg p-3 text-sm">
                <p className="font-medium text-zinc-700">Booking Details</p>
                <div className="mt-1 text-zinc-500 space-y-0.5">
                  <p>Applicant: {selectedBooking.applicant_name || '-'}</p>
                  <p>Project: {selectedBooking.project_name} — Unit {selectedBooking.unit_no}</p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUploadDialogOpen(false); resetForm() }} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={loading || !selectedBookingId}>
              {loading ? 'Uploading...' : 'Upload & Request Approval'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
