'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { ChevronRight, ChevronLeft, Save, CheckCircle2, FileText, Trash2 } from 'lucide-react'
import { BookingFormData } from '@/lib/validations/booking'
import { Booking } from '@/lib/types/database'
import { saveDraft, submitBooking, getDraft, deleteDraft } from './actions'
import { Step1ProjectUnit } from './step-1-project-unit'
import { Step2Applicant } from './step-2-applicant'
import { Step3PricingPayment } from './step-3-pricing-payment'
import { Step4Review } from './step-4-review'

const STEPS = [
  { number: 1, title: 'Project & Unit', description: 'Property details' },
  { number: 2, title: 'Applicant(s)', description: 'Customer information' },
  { number: 3, title: 'Pricing & Payment', description: 'Financial details' },
  { number: 4, title: 'Review', description: 'Confirm & submit' },
]

interface BookingWizardProps {
  drafts: Booking[]
}

export function BookingWizard({ drafts }: BookingWizardProps) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState<Partial<BookingFormData>>({
    project_location: 'Ranchi, Jharkhand',
    unit_category: 'Residential',
    unit_type: 'Flat',
    payment_mode: 'UPI',
    payment_plan_type: 'ConstructionLinked',
    other_charges: 0,
  })
  const [draftId, setDraftId] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [submittedBookingId, setSubmittedBookingId] = useState<string>()
  const [draftsDialogOpen, setDraftsDialogOpen] = useState(false)

  const updateFormData = (data: Partial<BookingFormData>) => {
    setFormData((prev) => ({ ...prev, ...data }))
  }

  const handleSaveDraft = async () => {
    setSaving(true)
    try {
      const result = await saveDraft(formData, draftId)
      setDraftId(result.draftId)
      toast.success('Draft saved', {
        description: 'Your progress has been saved.',
      })
    } catch (error) {
      toast.error('Failed to save draft')
    } finally {
      setSaving(false)
    }
  }

  const handleLoadDraft = async (id: string) => {
    try {
      const draft = await getDraft(id)
      setFormData(draft)
      setDraftId(id)
      setDraftsDialogOpen(false)
      setCurrentStep(1)
      toast.success('Draft loaded')
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
      const result = await submitBooking(formData as BookingFormData, draftId)
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

  // Auto-calculate total cost
  useEffect(() => {
    if (formData.basic_sale_price && formData.other_charges !== undefined) {
      const basicPrice = typeof formData.basic_sale_price === 'number' ? formData.basic_sale_price : parseFloat(String(formData.basic_sale_price)) || 0
      const otherCharges = typeof formData.other_charges === 'number' ? formData.other_charges : parseFloat(String(formData.other_charges)) || 0
      const autoTotal = basicPrice + otherCharges
      if (!formData.total_cost || Math.abs(parseFloat(String(formData.total_cost || 0)) - autoTotal) < 0.01) {
        setFormData((prev) => ({ ...prev, total_cost: autoTotal }))
      }
    }
  }, [formData.basic_sale_price, formData.other_charges])

  return (
    <>
      <div className="space-y-6">
        {/* Draft Actions */}
        {drafts.length > 0 && (
          <Card className="border-zinc-200 shadow-sm bg-blue-50 border-blue-200">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <p className="text-sm font-medium text-blue-900">
                    You have {drafts.length} saved draft{drafts.length > 1 ? 's' : ''}
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setDraftsDialogOpen(true)}
                  className="border-blue-300 text-blue-700 hover:bg-blue-100"
                >
                  Load Draft
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stepper */}
        <Card className="border-zinc-200 shadow-sm">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
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
                data={formData}
                onUpdate={updateFormData}
                onNext={() => goToStep(2)}
              />
            )}
            {currentStep === 2 && (
              <Step2Applicant
                data={formData}
                onUpdate={updateFormData}
                onNext={() => goToStep(3)}
                onBack={() => goToStep(1)}
              />
            )}
            {currentStep === 3 && (
              <Step3PricingPayment
                data={formData}
                onUpdate={updateFormData}
                onNext={() => goToStep(4)}
                onBack={() => goToStep(2)}
              />
            )}
            {currentStep === 4 && (
              <Step4Review
                data={formData as BookingFormData}
                onBack={() => goToStep(3)}
                onSubmit={handleSubmit}
                submitting={submitting}
              />
            )}

            {/* Save Draft Button */}
            {currentStep < 4 && (
              <div className="flex items-center justify-between pt-4 border-t border-zinc-200">
                <Button
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={saving}
                  className="gap-2"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save Draft'}
                </Button>
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

      {/* Success Dialog */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent className="max-w-md">
          <DialogTitle className="sr-only">Booking Submitted Successfully</DialogTitle>
          <div className="text-center py-6 space-y-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-semibold text-zinc-900">Booking Submitted!</h3>
              <p className="text-zinc-600 mt-2">
                Your booking has been successfully created and assigned a serial number.
              </p>
            </div>
            <div className="flex flex-col gap-3 pt-4">
              <Button
                onClick={() => router.push(`/bookings/${submittedBookingId}`)}
                className="w-full"
              >
                View Booking Details
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowSuccess(false)
                  setFormData({
                    project_location: 'Ranchi, Jharkhand',
                    unit_category: 'Residential',
                    unit_type: 'Flat',
                    payment_mode: 'UPI',
                    payment_plan_type: 'ConstructionLinked',
                    other_charges: 0,
                  })
                  setDraftId(undefined)
                  setCurrentStep(1)
                  router.refresh()
                }}
                className="w-full"
              >
                Create Another Booking
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

