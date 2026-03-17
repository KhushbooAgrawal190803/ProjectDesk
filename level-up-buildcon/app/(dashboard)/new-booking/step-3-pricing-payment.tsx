'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { step3Schema, Step3Data } from '@/lib/validations/booking'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { ChevronRight, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useEffect } from 'react'

const getErrorMessage = (error: any): string | null => {
  if (!error) return null
  return typeof error.message === 'string' ? error.message : null
}

interface Step3PricingPaymentProps {
  data: Partial<Step3Data> & { super_builtup_area?: number }
  onUpdate: (data: Partial<Step3Data>) => void
  onNext: () => void
  onBack: () => void
  availableParking?: number
}

export function Step3PricingPayment({ data, onUpdate, onNext, onBack, availableParking = 27 }: Step3PricingPaymentProps) {
  const superBuiltupArea = Number(data.super_builtup_area) || 0

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<Step3Data>({
    resolver: zodResolver(step3Schema) as any,
    defaultValues: data,
  })

  const ratePerSqft = watch('rate_per_sqft')
  const bookingAmountPaid = watch('booking_amount_paid')

  // Auto-calculate total cost from rate × area (no rounding)
  useEffect(() => {
    if (ratePerSqft != null && ratePerSqft !== '' && superBuiltupArea > 0) {
      const total = Number(ratePerSqft) * superBuiltupArea
      setValue('total_cost', total)
    }
  }, [ratePerSqft, superBuiltupArea, setValue])

  // Auto-calculate GST at 5% of booking amount paid (no rounding)
  useEffect(() => {
    if (bookingAmountPaid != null && bookingAmountPaid !== '') {
      const gst = Number(bookingAmountPaid) * 0.05
      setValue('gst_amount', gst)
    } else {
      setValue('gst_amount', undefined)
    }
  }, [bookingAmountPaid, setValue])

  const onSubmit = (formData: Step3Data) => {
    onUpdate(formData)
    onNext()
  }

  const handleError = (formErrors: any) => {
    const messages = Object.values(formErrors).map((e: any) => e?.message).filter(Boolean)
    toast.error('Please fix the following:', {
      description: messages.join(', ') || 'Some required fields are missing',
    })
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value)
  }

  const calculatedTotal = Number(ratePerSqft || 0) * superBuiltupArea
  const gstAmount = Number(bookingAmountPaid ?? 0) * 0.05

  return (
    <form onSubmit={handleSubmit(onSubmit, handleError)} className="space-y-6">
      {/* Pricing */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Pricing</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="rate_per_sqft">Rate per Sq.ft. (₹)</Label>
            <Input
              id="rate_per_sqft"
              type="number"
              step="any"
              {...register('rate_per_sqft')}
              placeholder="e.g., 5000"
            />
            {errors.rate_per_sqft && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.rate_per_sqft)}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="total_cost">Total Amount (₹)</Label>
            <Input
              id="total_cost"
              type="number"
              step="any"
              {...register('total_cost')}
              placeholder="0.00"
              readOnly={!!(superBuiltupArea > 0 && ratePerSqft)}
              className={superBuiltupArea > 0 && ratePerSqft ? 'bg-zinc-50' : ''}
            />
            {superBuiltupArea > 0 && ratePerSqft ? (
              <p className="text-xs text-zinc-500">
                {Number(ratePerSqft).toLocaleString('en-IN')} × {superBuiltupArea} sq.ft. = {formatCurrency(calculatedTotal)}
              </p>
            ) : superBuiltupArea === 0 ? (
              <p className="text-xs text-amber-600">Enter super built-up area in Step 1 for auto-calculation</p>
            ) : null}
            {errors.total_cost && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.total_cost)}</p>
            )}
          </div>
        </div>
      </div>

      {/* Payment Details */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Payment Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="booking_amount_paid">Booking Amount Paid (₹)</Label>
            <Input
              id="booking_amount_paid"
              type="number"
              step="any"
              {...register('booking_amount_paid')}
              placeholder="0.00"
            />
            {errors.booking_amount_paid && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.booking_amount_paid)}</p>
            )}
            {bookingAmountPaid && Number(bookingAmountPaid) > 0 && (
              <div className="rounded-md bg-blue-50 border border-blue-200 p-2">
                <p className="text-sm text-blue-700">
                  GST (5%): <span className="font-semibold">{formatCurrency(gstAmount)}</span>
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment_mode">Payment Mode</Label>
            <select
              id="payment_mode"
              {...register('payment_mode')}
              className="flex h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
            >
              <option value="Cash">Cash</option>
              <option value="Cheque">Cheque</option>
              <option value="NEFT_RTGS">NEFT / RTGS</option>
              <option value="UPI">UPI</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="txn_or_cheque_no">Transaction / Cheque No.</Label>
            <Input
              id="txn_or_cheque_no"
              {...register('txn_or_cheque_no')}
              placeholder="Enter reference number"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="txn_date">Transaction Date</Label>
            <Input
              id="txn_date"
              type="date"
              {...register('txn_date')}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="payment_mode_detail">Payment Details</Label>
            <Input
              id="payment_mode_detail"
              {...register('payment_mode_detail')}
              placeholder="Bank name, account details, etc."
            />
          </div>
        </div>
      </div>

      {/* Additional Parking */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Additional Parking</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="additional_parking">Additional Parking Spaces</Label>
            <select
              id="additional_parking"
              {...register('additional_parking')}
              className="flex h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
            >
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n === 0 ? 'None' : `${n} space${n > 1 ? 's' : ''}`}</option>
              ))}
            </select>
            <p className="text-xs text-zinc-500">
              {availableParking} of 27 parking spaces still available in this project
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4 border-t border-zinc-200">
        <Button type="button" variant="outline" onClick={onBack} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          Back
        </Button>
        <Button type="submit" className="gap-2">
          Review
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </form>
  )
}

