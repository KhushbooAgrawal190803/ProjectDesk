'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { step2Schema, Step2Data } from '@/lib/validations/booking'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { ChevronRight, ChevronLeft, UserPlus } from 'lucide-react'
import { toast } from 'sonner'

const getErrorMessage = (error: any): string | null => {
  if (!error) return null
  return typeof error.message === 'string' ? error.message : null
}

interface Step2ApplicantProps {
  data: Partial<Step2Data>
  onUpdate: (data: Partial<Step2Data>) => void
  onNext: () => void
  onBack: () => void
}

export function Step2Applicant({ data, onUpdate, onNext, onBack }: Step2ApplicantProps) {
  const [showCoApplicant, setShowCoApplicant] = useState(data.has_coapplicant || false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Step2Data>({
    resolver: zodResolver(step2Schema) as any,
    defaultValues: data as any,
  })

  const onSubmit = (formData: Step2Data) => {
    onUpdate({ ...formData, has_coapplicant: showCoApplicant })
    onNext()
  }

  const handleError = () => {
    toast.error('Please fill in all required fields correctly')
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, handleError)} className="space-y-6">
      {/* Applicant Information */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Primary Applicant</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="applicant_name">Full Name *</Label>
            <Input
              id="applicant_name"
              {...register('applicant_name')}
              placeholder="Enter full name"
            />
            {errors.applicant_name && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.applicant_name)}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="applicant_father_or_spouse">Father&apos;s / Spouse Name *</Label>
            <Input
              id="applicant_father_or_spouse"
              {...register('applicant_father_or_spouse')}
              placeholder="Enter name"
            />
            {errors.applicant_father_or_spouse && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.applicant_father_or_spouse)}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="applicant_mobile">Mobile Number *</Label>
            <Input
              id="applicant_mobile"
              {...register('applicant_mobile')}
              placeholder="10-digit mobile number"
              maxLength={10}
            />
            {errors.applicant_mobile && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.applicant_mobile)}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="applicant_email">Email Address</Label>
            <Input
              id="applicant_email"
              type="email"
              {...register('applicant_email')}
              placeholder="email@example.com"
            />
            {errors.applicant_email && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.applicant_email)}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="applicant_pan">PAN Number</Label>
            <Input
              id="applicant_pan"
              {...register('applicant_pan')}
              placeholder="ABCDE1234F"
              maxLength={10}
              style={{ textTransform: 'uppercase' }}
            />
            {errors.applicant_pan && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.applicant_pan)}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="applicant_aadhaar">Aadhaar Number</Label>
            <Input
              id="applicant_aadhaar"
              {...register('applicant_aadhaar')}
              placeholder="12-digit Aadhaar"
              maxLength={12}
            />
            {errors.applicant_aadhaar && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.applicant_aadhaar)}</p>
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="applicant_address">Address</Label>
            <Input
              id="applicant_address"
              {...register('applicant_address')}
              placeholder="Full address"
            />
          </div>
        </div>
      </div>

      {/* Co-Applicant Toggle */}
      <div className="flex items-center gap-3 p-4 border border-zinc-200 rounded-lg bg-zinc-50">
        <Checkbox
          id="has_coapplicant"
          checked={showCoApplicant}
          onCheckedChange={(checked) => setShowCoApplicant(checked as boolean)}
        />
        <Label htmlFor="has_coapplicant" className="flex items-center gap-2 cursor-pointer">
          <UserPlus className="w-4 h-4" />
          Add Co-Applicant
        </Label>
      </div>

      {/* Co-Applicant Information */}
      {showCoApplicant && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Co-Applicant</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="coapplicant_name">Full Name *</Label>
              <Input
                id="coapplicant_name"
                {...register('coapplicant_name')}
                placeholder="Enter full name"
              />
              {errors.coapplicant_name && (
                <p className="text-sm text-red-600">{getErrorMessage(errors.coapplicant_name)}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="coapplicant_relationship">Relationship *</Label>
              <Input
                id="coapplicant_relationship"
                {...register('coapplicant_relationship')}
                placeholder="e.g., Spouse, Parent"
              />
              {errors.coapplicant_relationship && (
                <p className="text-sm text-red-600">{getErrorMessage(errors.coapplicant_relationship)}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="coapplicant_mobile">Mobile Number</Label>
              <Input
                id="coapplicant_mobile"
                {...register('coapplicant_mobile')}
                placeholder="10-digit mobile number"
                maxLength={10}
              />
              {errors.coapplicant_mobile && (
                <p className="text-sm text-red-600">{getErrorMessage(errors.coapplicant_mobile)}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="coapplicant_pan">PAN Number</Label>
              <Input
                id="coapplicant_pan"
                {...register('coapplicant_pan')}
                placeholder="ABCDE1234F"
                maxLength={10}
                style={{ textTransform: 'uppercase' }}
              />
              {errors.coapplicant_pan && (
                <p className="text-sm text-red-600">{getErrorMessage(errors.coapplicant_pan)}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="coapplicant_aadhaar">Aadhaar Number</Label>
              <Input
                id="coapplicant_aadhaar"
                {...register('coapplicant_aadhaar')}
                placeholder="12-digit Aadhaar"
                maxLength={12}
              />
              {errors.coapplicant_aadhaar && (
                <p className="text-sm text-red-600">{getErrorMessage(errors.coapplicant_aadhaar)}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-4 border-t border-zinc-200">
        <Button type="button" variant="outline" onClick={onBack} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          Back
        </Button>
        <Button type="submit" className="gap-2">
          Continue
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </form>
  )
}

