'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Upload, X, FileText, Image, Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { uploadDocument, deleteDocument } from './document-actions'
import { DocumentType } from '@/lib/types/database'

export interface UploadedDoc {
  id: string
  documentType: DocumentType
  fileName: string
  fileSize: number
  mimeType: string
}

interface DocumentUploadProps {
  label: string
  documentType: DocumentType
  bookingId?: string
  uploadedDoc?: UploadedDoc
  onUpload: (doc: UploadedDoc) => void
  onRemove: (documentType: DocumentType) => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function DocumentUploadField({ label, documentType, bookingId, uploadedDoc, onUpload, onRemove }: DocumentUploadProps) {
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type', { description: 'Only JPG, PNG, WebP, or PDF files are allowed' })
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large', { description: 'Maximum file size is 10MB' })
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('documentType', documentType)
      formData.append('bookingId', bookingId || 'pending')

      const result = await uploadDocument(formData)

      if (result.success && result.documentId) {
        onUpload({
          id: result.documentId,
          documentType,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        })
        toast.success('Document uploaded')
      } else {
        toast.error('Upload failed', { description: result.error })
      }
    } catch (error: any) {
      toast.error('Upload failed', { description: error.message })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemove = async () => {
    if (!uploadedDoc) return
    try {
      const result = await deleteDocument(uploadedDoc.id)
      if (result.success) {
        onRemove(documentType)
        toast.success('Document removed')
      } else {
        toast.error('Failed to remove', { description: result.error })
      }
    } catch {
      toast.error('Failed to remove document')
    }
  }

  const isImage = uploadedDoc?.mimeType?.startsWith('image/')

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {uploadedDoc ? (
        <div className="flex items-center gap-3 p-3 border border-green-200 bg-green-50 rounded-lg">
          <div className="flex-shrink-0">
            {isImage ? (
              <Image className="w-5 h-5 text-green-600" />
            ) : (
              <FileText className="w-5 h-5 text-green-600" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-900 truncate">{uploadedDoc.fileName}</p>
            <p className="text-xs text-green-600">{formatFileSize(uploadedDoc.fileSize)}</p>
          </div>
          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            className="text-red-500 hover:text-red-700 hover:bg-red-50 flex-shrink-0 h-8 w-8 p-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <div
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`flex items-center gap-3 p-3 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
            uploading
              ? 'border-zinc-300 bg-zinc-50 cursor-wait'
              : 'border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50'
          }`}
        >
          {uploading ? (
            <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
          ) : (
            <Upload className="w-5 h-5 text-zinc-400" />
          )}
          <div className="flex-1">
            <p className="text-sm text-zinc-600">
              {uploading ? 'Uploading...' : 'Click to upload'}
            </p>
            <p className="text-xs text-zinc-400">JPG, PNG, WebP, or PDF (max 10MB)</p>
          </div>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  )
}

interface DocumentUploadSectionProps {
  showCoApplicant: boolean
  bookingId?: string
  documents: Record<string, UploadedDoc>
  onDocumentsChange: (docs: Record<string, UploadedDoc>) => void
}

export function DocumentUploadSection({ showCoApplicant, bookingId, documents, onDocumentsChange }: DocumentUploadSectionProps) {
  const handleUpload = (doc: UploadedDoc) => {
    onDocumentsChange({ ...documents, [doc.documentType]: doc })
  }

  const handleRemove = (documentType: DocumentType) => {
    const updated = { ...documents }
    delete updated[documentType]
    onDocumentsChange(updated)
  }

  return (
    <div className="space-y-6">
      {/* Applicant Documents */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Applicant Documents</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DocumentUploadField
            label="PAN Card (Image/PDF)"
            documentType="applicant_pan"
            bookingId={bookingId}
            uploadedDoc={documents['applicant_pan']}
            onUpload={handleUpload}
            onRemove={handleRemove}
          />
          <DocumentUploadField
            label="Aadhaar Card (Image/PDF)"
            documentType="applicant_aadhaar"
            bookingId={bookingId}
            uploadedDoc={documents['applicant_aadhaar']}
            onUpload={handleUpload}
            onRemove={handleRemove}
          />
        </div>
      </div>

      {/* Co-Applicant Documents */}
      {showCoApplicant && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Co-Applicant Documents</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DocumentUploadField
              label="PAN Card (Image/PDF)"
              documentType="coapplicant_pan"
              bookingId={bookingId}
              uploadedDoc={documents['coapplicant_pan']}
              onUpload={handleUpload}
              onRemove={handleRemove}
            />
            <DocumentUploadField
              label="Aadhaar Card (Image/PDF)"
              documentType="coapplicant_aadhaar"
              bookingId={bookingId}
              uploadedDoc={documents['coapplicant_aadhaar']}
              onUpload={handleUpload}
              onRemove={handleRemove}
            />
          </div>
        </div>
      )}
    </div>
  )
}
