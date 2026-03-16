'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CheckCircle2, XCircle, Eye, FileText, Send } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { approveDispatchDocument, rejectDispatchDocument } from './dispatch-actions'

interface PendingDispatch {
  id: string
  booking_id: string
  copy_type: string
  file_name: string
  file_size?: number
  recipient_email?: string
  recipient_phone?: string
  status: string
  created_at: string
  uploader?: { full_name: string; email: string }
  booking?: {
    serial_display?: string
    applicant_name?: string
    applicant_mobile?: string
    applicant_email?: string
  }
}

interface PendingDispatchesClientProps {
  dispatches: PendingDispatch[]
}

export function PendingDispatchesClient({ dispatches }: PendingDispatchesClientProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  const handleApprove = async (docId: string) => {
    setLoading(docId)
    try {
      const result = await approveDispatchDocument(docId)
      const channels: string[] = []
      if (result.emailSent) channels.push('Email')
      if (result.whatsappSent) channels.push('WhatsApp')
      
      if (channels.length > 0) {
        toast.success('Document approved & sent!', {
          description: `Sent via ${channels.join(' & ')} to the customer.`,
        })
      } else {
        toast.success('Document approved', {
          description: 'Email/WhatsApp not configured. Add SMTP & Twilio env vars to enable auto-sending.',
        })
      }
    } catch (error: any) {
      toast.error('Failed to approve', { description: error.message })
    } finally {
      setLoading(null)
    }
  }

  const handleReject = async () => {
    if (!selectedDocId) return
    setLoading(selectedDocId)
    try {
      await rejectDispatchDocument(selectedDocId, rejectionReason)
      toast.success('Document rejected')
      setRejectDialogOpen(false)
      setRejectionReason('')
      setSelectedDocId(null)
    } catch (error: any) {
      toast.error('Failed to reject', { description: error.message })
    } finally {
      setLoading(null)
    }
  }

  if (dispatches.length === 0) {
    return null
  }

  return (
    <>
      <Card className="border-amber-200 shadow-sm bg-amber-50/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Send className="w-5 h-5 text-amber-600" />
            <h3 className="font-semibold text-amber-900">Pending Dispatch Approvals</h3>
            <Badge variant="secondary" className="bg-amber-100 text-amber-800 ml-auto">
              {dispatches.length} pending
            </Badge>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-amber-100/50">
                  <TableHead className="font-semibold text-amber-900">Booking</TableHead>
                  <TableHead className="font-semibold text-amber-900">Copy</TableHead>
                  <TableHead className="font-semibold text-amber-900">File</TableHead>
                  <TableHead className="font-semibold text-amber-900">Send To</TableHead>
                  <TableHead className="font-semibold text-amber-900">Uploaded By</TableHead>
                  <TableHead className="font-semibold text-amber-900">Date</TableHead>
                  <TableHead className="text-right font-semibold text-amber-900">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dispatches.map((doc) => (
                  <TableRow key={doc.id} className="hover:bg-amber-50">
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
                        {doc.copy_type === 'customer' ? 'Customer' : 'Company'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-zinc-400" />
                        <span className="text-sm truncate max-w-[150px]">{doc.file_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs space-y-0.5">
                        {doc.recipient_email && <p>✉️ {doc.recipient_email}</p>}
                        {doc.recipient_phone && <p>💬 {doc.recipient_phone}</p>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-zinc-600">
                      {doc.uploader?.full_name}
                    </TableCell>
                    <TableCell className="text-sm text-zinc-600">
                      {format(new Date(doc.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 justify-end">
                        <a
                          href={`/api/dispatch-documents/${doc.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button variant="outline" size="sm" className="gap-1">
                            <Eye className="w-3 h-3" />
                          </Button>
                        </a>
                        <Button
                          size="sm"
                          className="gap-1 bg-green-600 hover:bg-green-700"
                          onClick={() => handleApprove(doc.id)}
                          disabled={loading === doc.id}
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Approve & Send
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="gap-1"
                          onClick={() => {
                            setSelectedDocId(doc.id)
                            setRejectDialogOpen(true)
                          }}
                          disabled={loading === doc.id}
                        >
                          <XCircle className="w-3 h-3" />
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Dispatch Document</DialogTitle>
            <DialogDescription>
              Provide a reason for rejection. The accounts team will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Reason for rejection..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={loading !== null || !rejectionReason.trim()}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
