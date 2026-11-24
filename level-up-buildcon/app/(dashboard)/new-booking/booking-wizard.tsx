'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { ChevronRight, CheckCircle2, FileText, Save, Trash2 } from 'lucide-react'
import { BookingFormData } from '@/lib/validations/booking'
import type { CoApplicantInput, ParkingSpaceInput } from '@/lib/booking/persist-details'
import type { ScheduleRowInput } from '@/lib/booking/schedule'
import { Booking } from '@/lib/types/database'
import { saveDraft, submitBooking, getDraft, deleteDraft } from './actions'
import { linkDocumentsToBooking, getDraftDocuments } from './document-actions'
import { UploadedDoc } from './document-upload'
import { Step1ProjectUnit } from './step-1-project-unit'
import { Step2Applicant } from './step-2-applicant'
import { Step3PricingPayment } from './step-3-pricing-payment'
import { Step4Review } from './step-4-review'
import { StepNoc } from './step-noc'
import { StepPaymentSchedule } from './step-payment-schedule'
import type { DraftSnapshot } from './draft-snapshot'

/** How often an open draft is saved to the database while it is being filled in. */
const AUTOSAVE_INTERVAL_MS = 30_000

type WizardForm = Partial<BookingFormData> & {
  schedule_mode?: 'standard' | 'custom'
  coapplicants?: CoApplicantInput[]
  parking_spaces?: ParkingSpaceInput[]
  schedule_rows?: ScheduleRowInput[]
  total_parking_charges?: number
  total_property_value?: number
  pricing_mode?: 'rate' | 'lump_sum'
}

const STEPS = [
  { number: 1, title: 'Project & Unit', description: 'Property details' },
  { number: 2, title: 'Applicant(s)', description: 'Customer information' },
  { number: 3, title: 'Price & Payments', description: 'Price, financing and payments received' },
  { number: 4, title: 'Bank NOC', description: 'If a bank letter is needed' },
  { number: 5, title: 'Payment Schedule', description: 'Slabs on the flat price' },
  { number: 6, title: 'Review', description: 'Confirm & submit' },
]

interface BookingWizardProps {
  drafts: Booking[]
  prefilledUnit?: string | null
  preselectedDraftId?: string | null
  availableParking?: number
  availablePremiumParking?: number
  /** Payment ledger migration 010 is installed. */
  ledgerReady?: boolean
}

export function BookingWizard({
  drafts,
  prefilledUnit,
  preselectedDraftId = null,
  availableParking = 27,
  availablePremiumParking = 9,
  ledgerReady = false,
}: BookingWizardProps) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState<WizardForm>({
    project_name: 'Anandam',
    project_location: 'Ranchi, Jharkhand',
    project_address: 'PLOT NO 1089 KHATA NO 74, GUTUWA NAGRI RANCHI JHARKHAND',
    rera_regn_no: 'JHARERA/PROJECT/15/2026',
    building_permit_no: 'RRDA/GH/0369/2025',
    unit_category: 'Residential',
    unit_type: 'Flat',
    payment_mode: 'Cash',
    additional_parking: 0,
    premium_parking: 0,
    gst_collected: 0,
    noc_required: false,
    applicant_country: 'India',
    schedule_mode: 'standard',
    coapplicants: [],
    parking_spaces: [],
    ...(prefilledUnit ? { unit_no: prefilledUnit } : {}),
  })
  const [draftId, setDraftId] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [submittedBookingId, setSubmittedBookingId] = useState<string>()
  const [draftsDialogOpen, setDraftsDialogOpen] = useState(false)
  const [documents, setDocuments] = useState<Record<string, UploadedDoc>>({})
  const [formKey, setFormKey] = useState(0)
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [editingSubmitted, setEditingSubmitted] = useState(false)
  const [loadedStatus, setLoadedStatus] = useState<string | null>(null)
  const [autosave, setAutosave] = useState<{ state: 'idle' | 'saving' | 'saved' | 'failed'; at?: Date }>({ state: 'idle' })

  // Autosave bookkeeping. Refs, so the timer always sees the latest values.
  const snapshotRef = useRef<(() => DraftSnapshot) | null>(null)
  const draftIdRef = useRef<string | undefined>(undefined)
  const lastSavedRef = useRef<string | null>(null)
  const inFlightRef = useRef<Promise<unknown> | null>(null)
  const registerSnapshot = useCallback((collect: (() => DraftSnapshot) | null) => {
    snapshotRef.current = collect
  }, [])
  useEffect(() => {
    draftIdRef.current = draftId
  }, [draftId])

  // Auto-load a pending/draft booking when navigated via /new-booking?draftId=...
  // (Used for Accounts editing their own PENDING bookings)
  useEffect(() => {
    if (preselectedDraftId && !draftLoaded) {
      handleLoadDraft(preselectedDraftId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedDraftId])

  const updateFormData = (data: WizardForm) => {
    setFormData((prev) => ({ ...prev, ...data }))
  }

  const linkUploadedDocuments = async (bookingId: string) => {
    const docIds = Object.values(documents).map((doc) => doc.id)
    if (!docIds.length) return
    const coapplicantByDocument: Record<string, string | null> = {}
    const people = ((formData as { coapplicants?: { id: string }[] }).coapplicants) || []
    for (const [key, doc] of Object.entries(documents)) {
      const owner = people.find((person) => key.startsWith(`${person.id}:`))
      if (owner) coapplicantByDocument[doc.id] = owner.id
    }
    await linkDocumentsToBooking(docIds, bookingId, coapplicantByDocument)
  }

  /** The saved form plus whatever is typed on the current step but not yet confirmed with Next. */
  const currentValues = (): WizardForm => ({ ...formData, ...(snapshotRef.current?.() as WizardForm | undefined) })

  /** Saves to the database, one save at a time, so a new booking never becomes two drafts. */
  const persist = async (values: WizardForm) => {
    while (inFlightRef.current) await inFlightRef.current.catch(() => undefined)
    const signature = JSON.stringify(values)
    const run = (async () => {
      const result = await saveDraft(values, draftIdRef.current)
      draftIdRef.current = result.draftId
      setDraftId(result.draftId)
      await linkUploadedDocuments(result.draftId)
      lastSavedRef.current = signature
      setAutosave({ state: 'saved', at: new Date() })
      return result
    })()
    inFlightRef.current = run
    try {
      return await run
    } finally {
      inFlightRef.current = null
    }
  }

  const handleSaveDraft = async () => {
    setSaving(true)
    try {
      await persist(currentValues())
      toast.success(editingSubmitted ? 'Changes saved' : 'Draft saved', {
        description: editingSubmitted ? 'The booking has been updated.' : 'Your progress has been saved.',
      })
    } catch (error) {
      toast.error('Failed to save draft', { description: error instanceof Error ? error.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  // Autosave applies to new bookings and drafts only. A booking already submitted
  // (or awaiting approval) is changed only when someone presses Save, never in the background.
  const autosaveEnabled = !editingSubmitted && loadedStatus !== 'PENDING' && !showSuccess && !submitting
  const autosaveTick = useRef<() => void>(() => undefined)
  useEffect(() => {
    autosaveTick.current = () => {
      if (!autosaveEnabled || inFlightRef.current) return
      const values = currentValues()
      // Nothing worth keeping yet: do not create empty drafts.
      if (!values.unit_no && !values.applicant_name && !values.applicant_mobile) return
      if (JSON.stringify(values) === lastSavedRef.current) return
      setAutosave((current) => ({ ...current, state: 'saving' }))
      persist(values).catch(() => setAutosave((current) => ({ ...current, state: 'failed' })))
    }
  })
  useEffect(() => {
    const timer = window.setInterval(() => autosaveTick.current(), AUTOSAVE_INTERVAL_MS)
    const onHide = () => {
      if (document.visibilityState === 'hidden') autosaveTick.current()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [])
  // Moving to another step is a natural point to save.
  useEffect(() => {
    if (currentStep > 1) autosaveTick.current()
  }, [currentStep])
  // Warn before closing the tab with changes that have not reached the database.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!autosaveEnabled && !editingSubmitted) return
      const values = currentValues()
      if (!values.unit_no && !values.applicant_name && !values.applicant_mobile) return
      if (JSON.stringify(values) === lastSavedRef.current) return
      autosaveTick.current()
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  })

  const handleLoadDraft = async (id: string) => {
    try {
      const draft = await getDraft(id)
      
      // Only keep booking form fields, convert null to undefined
      const formFields = [
        'project_name', 'project_location', 'project_address', 'rera_regn_no', 'building_permit_no',
        'unit_category', 'unit_type', 'unit_type_other_text', 'unit_no', 'floor_no',
        'builtup_area', 'super_builtup_area', 'carpet_area',
        'applicant_name', 'applicant_salutation', 'applicant_father_or_spouse', 'applicant_relationship', 'applicant_occupation', 'applicant_mobile', 'applicant_email',
        'applicant_pan', 'applicant_aadhaar', 'applicant_address',
        'applicant_address_line1', 'applicant_address_line2', 'applicant_city', 'applicant_state', 'applicant_pin_code', 'applicant_country',
        'boundary_east', 'boundary_west', 'boundary_north', 'boundary_south',
        'coapplicant_name', 'coapplicant_relationship', 'coapplicant_mobile',
        'coapplicant_pan', 'coapplicant_aadhaar',
        'rate_per_sqft', 'total_cost', 'gst_amount', 'gst_collected',
        'booking_amount_paid', 'payment_mode', 'payment_mode_detail',
        'txn_or_cheque_no', 'txn_date', 'allotment_date', 'agreement_for_sale_date', 'additional_parking', 'premium_parking',
        'noc_required', 'noc_bank_name', 'noc_addressee', 'noc_bank_address',
        'noc_bank_address_line1', 'noc_bank_address_line2', 'noc_bank_city', 'noc_bank_state', 'noc_bank_pin_code', 'noc_bank_country',
        'payment_plan_type',
        'finance_scenario', 'finance_bank_name', 'finance_bank_branch', 'finance_bank_address', 'finance_loan_status',
        'finance_purchaser_percent', 'finance_bank_percent', 'finance_split_scope',
        'finance_sanction_ref', 'finance_sanction_amount', 'finance_sanction_date', 'undivided_land_share',
      ]
      const sanitized: Record<string, any> = {}
      for (const key of formFields) {
        const val = (draft as any)[key]
        if (val !== null && val !== undefined) {
          sanitized[key] = val
        }
      }
      // Detect co-applicant
      sanitized.coapplicants = (draft as any).coapplicants || []
      sanitized.payment_entries = (draft as any).payment_entries || []
      sanitized.parking_spaces = (draft as any).parking_spaces || []
      sanitized.schedule_rows = (draft as any).schedule_rows || []
      sanitized.schedule_mode = (draft as any).schedule_mode || 'standard'
      sanitized.pricing_mode = sanitized.rate_per_sqft ? 'rate' : sanitized.total_cost ? 'lump_sum' : 'rate'
      if (sanitized.coapplicant_name) {
        sanitized.has_coapplicant = true
      }
      
      // Restore previously uploaded documents for this draft
      const existingDocs = await getDraftDocuments(id)
      const restoredDocs: Record<string, UploadedDoc> = {}
      for (const doc of existingDocs) {
        const key = doc.coapplicant_id
          ? `${doc.coapplicant_id}:${doc.document_type === 'coapplicant_pan' ? 'pan' : 'aadhaar'}`
          : doc.document_type
        restoredDocs[key] = {
          id: doc.id,
          documentType: doc.document_type,
          fileName: doc.file_name,
          fileSize: doc.file_size || 0,
          mimeType: doc.mime_type || '',
        }
      }
      
      const status = String((draft as { status?: string }).status || '')
      const alreadySubmitted = status === 'SUBMITTED' || status === 'EDITED'
      setEditingSubmitted(alreadySubmitted)
      setLoadedStatus(status)
      lastSavedRef.current = null
      setAutosave({ state: 'idle' })
      setFormData(sanitized)
      setDocuments(restoredDocs)
      setDraftId(id)
      draftIdRef.current = id
      setDraftsDialogOpen(false)
      setCurrentStep(1)
      setFormKey((k) => k + 1)
      setDraftLoaded(true)
      toast.success(alreadySubmitted ? 'Booking opened for editing' : 'Draft loaded')
    } catch (error) {
      toast.error('Failed to load draft')
    }
  }

  const handleDeleteDraft = async (id: string) => {
    try {
      await deleteDraft(id)
      toast.success('Draft deleted')
      router.refresh()
    } catch (error) {
      toast.error('Failed to delete draft')
    }
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      // Let a background save finish first, so it cannot create a second copy of this booking.
      while (inFlightRef.current) await inFlightRef.current.catch(() => undefined)
      const result = await submitBooking(formData as BookingFormData, draftIdRef.current)
      await linkUploadedDocuments(result.bookingId)
      
      setSubmittedBookingId(result.bookingId)
      setShowSuccess(true)
    } catch (error: any) {
      toast.error('Failed to submit booking', {
        description: error.message,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const goToStep = (step: number) => {
    setCurrentStep(step)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <div className="space-y-6">
        {/* Draft Actions */}
        {drafts.length > 0 && !draftLoaded && (
          <Card className="border-zinc-200 shadow-sm bg-blue-50 border-blue-200">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <p className="text-sm font-medium text-blue-900">
                    You have {drafts.length} saved draft{drafts.length > 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link href="/drafts" className="text-sm font-medium text-blue-700 hover:underline">See all drafts</Link>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDraftsDialogOpen(true)}
                    className="border-blue-300 text-blue-700 hover:bg-blue-100"
                  >
                    Load Draft
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stepper */}
        <Card className="border-zinc-200 shadow-sm">
          <CardContent className="py-6">
            <div className="flex items-center justify-between gap-2 overflow-x-auto">
              {STEPS.map((step, index) => (
                <div key={step.number} className="flex items-center flex-1">
                  <button
                    onClick={() => goToStep(step.number)}
                    disabled={step.number > currentStep}
                    className={`flex items-center gap-3 flex-1 group ${
                      step.number > currentStep ? 'cursor-not-allowed' : 'cursor-pointer'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
                        step.number < currentStep
                          ? 'bg-green-600 text-white'
                          : step.number === currentStep
                          ? 'bg-zinc-900 text-white'
                          : 'bg-zinc-100 text-zinc-400'
                      }`}
                    >
                      {step.number < currentStep ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : (
                        step.number
                      )}
                    </div>
                    <div className="text-left">
                      <div
                        className={`text-sm font-medium ${
                          step.number <= currentStep ? 'text-zinc-900' : 'text-zinc-400'
                        }`}
                      >
                        {step.title}
                      </div>
                      <div className="text-xs text-zinc-500">{step.description}</div>
                    </div>
                  </button>
                  {index < STEPS.length - 1 && (
                    <ChevronRight className="w-5 h-5 text-zinc-300 mx-2" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Step Content */}
        <Card className="border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">
              Step {currentStep}: {STEPS[currentStep - 1].title}
            </CardTitle>
            <CardDescription>{STEPS[currentStep - 1].description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {currentStep === 1 && (
              <Step1ProjectUnit
                key={formKey}
                data={formData}
                onUpdate={updateFormData}
                onNext={() => goToStep(2)}
                draftId={draftId}
                onSnapshot={registerSnapshot}
              />
            )}
            {currentStep === 2 && (
              <Step2Applicant
                key={formKey}
                data={formData}
                onUpdate={updateFormData}
                onNext={() => goToStep(3)}
                onBack={() => goToStep(1)}
                draftId={draftId}
                documents={documents}
                onDocumentsChange={setDocuments}
                onSnapshot={registerSnapshot}
              />
            )}
            {currentStep === 3 && (
              <Step3PricingPayment
                key={formKey}
                data={formData}
                onUpdate={updateFormData}
                onNext={() => goToStep(4)}
                onBack={() => goToStep(2)}
                availableParking={availableParking}
                availablePremiumParking={availablePremiumParking}
                ledgerReady={ledgerReady}
                onSnapshot={registerSnapshot}
              />
            )}
            {currentStep === 4 && (
              <StepNoc
                key={formKey}
                data={formData}
                onUpdate={updateFormData}
                onNext={() => goToStep(5)}
                onBack={() => goToStep(3)}
                onSnapshot={registerSnapshot}
              />
            )}
            {currentStep === 5 && (
              <StepPaymentSchedule
                key={formKey}
                data={formData}
                onUpdate={updateFormData}
                onNext={() => goToStep(6)}
                onBack={() => goToStep(4)}
                onSnapshot={registerSnapshot}
              />
            )}
            {currentStep === 6 && (
              <Step4Review
                data={formData as BookingFormData}
                onBack={() => goToStep(5)}
                onSubmit={handleSubmit}
                submitting={submitting}
                submitLabel={editingSubmitted ? 'Save changes' : 'Submit Booking'}
                documents={documents}
              />
            )}

            {/* Save Draft Button */}
            {currentStep < 6 && (
              <div className="flex items-center justify-between pt-4 border-t border-zinc-200">
                <Button
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={saving}
                  className="gap-2"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : editingSubmitted ? 'Save changes' : 'Save Draft'}
                </Button>
                {autosaveEnabled && (
                  <p className={`text-xs ${autosave.state === 'failed' ? 'text-red-600' : 'text-zinc-500'}`} aria-live="polite">
                    {autosave.state === 'saving' && 'Saving…'}
                    {autosave.state === 'saved' && autosave.at && `Saved automatically at ${autosave.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                    {autosave.state === 'failed' && 'Autosave failed. Press Save Draft to try again.'}
                    {autosave.state === 'idle' && 'Your draft is saved automatically every 30 seconds.'}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Drafts Dialog */}
      <Dialog open={draftsDialogOpen} onOpenChange={setDraftsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Load Draft</DialogTitle>
            <DialogDescription>
              Choose a draft to continue working on
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className="flex items-center justify-between p-4 border border-zinc-200 rounded-lg hover:bg-zinc-50"
              >
                <div className="flex-1">
                  <div className="font-medium text-zinc-900">
                    {draft.applicant_name || 'Untitled Draft'}
                  </div>
                  <div className="text-sm text-zinc-600 mt-1">
                    {draft.project_name || 'No project'} • {draft.unit_no ? `Unit ${draft.unit_no}` : 'No unit'}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    Last updated: {new Date(draft.updated_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteDraft(draft.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleLoadDraft(draft.id)}
                  >
                    Load
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Success Dialog — no close (X); only New Booking, View Booking, Home */}
      <Dialog open={showSuccess} onOpenChange={() => {}}>
        <DialogContent className="max-w-md" showCloseButton={false}>
          <DialogTitle className="sr-only">Booking Submitted Successfully</DialogTitle>
          <div className="text-center py-6 space-y-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-semibold text-zinc-900">{editingSubmitted ? 'Changes saved' : 'Booking Submitted!'}</h3>
              <p className="text-zinc-600 mt-2">
                {editingSubmitted
                  ? 'The booking has been updated.'
                  : 'Your booking has been successfully created and assigned a serial number.'}
              </p>
            </div>
            <div className="flex flex-col gap-3 pt-4">
              <Button
                onClick={() => {
                  setShowSuccess(false)
                  router.push(`/bookings/${submittedBookingId}`)
                }}
                className="w-full gap-2"
              >
                <FileText className="w-4 h-4" />
                View Booking
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowSuccess(false)
                  setFormData({
                    project_name: 'Anandam',
                    project_location: 'Ranchi, Jharkhand',
                    project_address: 'PLOT NO 1089 KHATA NO 74, GUTUWA NAGRI RANCHI JHARKHAND',
                    rera_regn_no: 'JHARERA/PROJECT/15/2026',
                    building_permit_no: 'RRDA/GH/0369/2025',
                    unit_category: 'Residential',
                    unit_type: 'Flat',
                    payment_mode: 'Cash',
                    additional_parking: 0,
                    premium_parking: 0,
                    gst_collected: 0,
                    noc_required: false,
                    applicant_country: 'India',
                    schedule_mode: 'standard',
                    coapplicants: [],
                    parking_spaces: [],
                  })
                  setDraftId(undefined)
                  setCurrentStep(1)
                  setDocuments({})
                  setFormKey((k) => k + 1)
                  router.refresh()
                }}
                className="w-full"
              >
                New Booking
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowSuccess(false)
                  router.push('/dashboard')
                }}
                className="w-full"
              >
                Home
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

