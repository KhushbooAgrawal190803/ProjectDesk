'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { step3Schema, Step3Data } from '@/lib/validations/booking'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ChevronRight, ChevronLeft, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useEffect } from 'react'

const getErrorMessage = (error: any): string | null => {
  if (!error) return null
  return typeof error.message === 'string' ? error.message : null
}

interface Step3PricingPaymentProps {
  data: Partial<Step3Data>
  onUpdate: (data: Partial<Step3Data>) => void
  onNext: () => void
  onBack: () => void
}

export function Step3PricingPayment({ data, onUpdate, onNext, onBack }: Step3PricingPaymentProps) {
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

  const basicSalePrice = watch('basic_sale_price')
  const otherCharges = watch('other_charges')
  const totalCost = watch('total_cost')
  const paymentPlanType = watch('payment_plan_type')

  // Auto-calculate total
  useEffect(() => {
    if (basicSalePrice && otherCharges !== undefined) {
      const autoTotal = Number(basicSalePrice) + Number(otherCharges)
      if (!totalCost || Math.abs(Number(totalCost) - autoTotal) < 0.01) {
        setValue('total_cost', autoTotal)
      }
    }
  }, [basicSalePrice, otherCharges, totalCost, setValue])

  const onSubmit = (formData: Step3Data) => {
    onUpdate(formData)
    onNext()
  }

  const handleError = () => {
    toast.error('Please fill in all required fields correctly')
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value)
  }

  const autoCalculatedTotal = (Number(basicSalePrice) || 0) + (Number(otherCharges) || 0)
  const hasOverride = Math.abs((Number(totalCost) || 0) - autoCalculatedTotal) > 0.01

  return (
    <form onSubmit={handleSubmit(onSubmit, handleError)} className="space-y-6">
      {/* Pricing */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Pricing</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="basic_sale_price">Basic Sale Price (₹) *</Label>
            <Input
              id="basic_sale_price"
              type="number"
              step="0.01"
              {...register('basic_sale_price')}
              placeholder="0.00"
            />
            {errors.basic_sale_price && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.basic_sale_price)}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="other_charges">Other Charges (₹)</Label>
            <Input
              id="other_charges"
              type="number"
              step="0.01"
              {...register('other_charges')}
              placeholder="0.00"
            />
            {errors.other_charges && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.other_charges)}</p>
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="total_cost">Total Cost (₹) *</Label>
            <Input
              id="total_cost"
              type="number"
              step="0.01"
              {...register('total_cost')}
              placeholder="0.00"
              className={hasOverride ? 'border-amber-500' : ''}
            />
            {basicSalePrice && otherCharges !== undefined && (
              <p className="text-sm text-zinc-500">
                Auto-calculated: {formatCurrency(autoCalculatedTotal)}
              </p>
            )}
            {errors.total_cost && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.total_cost)}</p>
            )}
          </div>

          {hasOverride && (
            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center gap-2 text-amber-600 mb-2">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm font-medium">Total cost override detected</span>
              </div>
              <Label htmlFor="total_cost_override_reason">Reason for Override *</Label>
              <Textarea
                id="total_cost_override_reason"
                {...register('total_cost_override_reason')}
                placeholder="Explain why the total differs from the calculated amount"
                rows={2}
              />
              {errors.total_cost_override_reason && (
                <p className="text-sm text-red-600">{getErrorMessage(errors.total_cost_override_reason)}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Payment Details */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Payment Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="booking_amount_paid">Booking Amount Paid (₹) *</Label>
            <Input
              id="booking_amount_paid"
              type="number"
              step="0.01"
              {...register('booking_amount_paid')}
              placeholder="0.00"
            />
            {errors.booking_amount_paid && (
              <p className="text-sm text-red-600">{errors.booking_amount_paid.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment_mode">Payment Mode *</Label>
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

      {/* Payment Plan */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Payment Plan</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label>Payment Plan Type *</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {['ConstructionLinked', 'DownPayment', 'PossessionLinked', 'Custom'].map((type) => (
                <label key={type}>
                  <input
                    type="radio"
                    value={type}
                    {...register('payment_plan_type')}
                    className="peer sr-only"
                  />
                  <div className="flex items-center justify-center h-11 px-3 border-2 border-zinc-200 rounded-lg cursor-pointer peer-checked:border-zinc-900 peer-checked:bg-zinc-50 transition-all text-center">
                    <span className="text-sm font-medium">
                      {type.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {paymentPlanType === 'Custom' && (
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="payment_plan_custom_text">Custom Payment Plan Details *</Label>
              <Textarea
                id="payment_plan_custom_text"
                {...register('payment_plan_custom_text')}
                placeholder="Describe the custom payment plan"
                rows={3}
              />
              {errors.payment_plan_custom_text && (
                <p className="text-sm text-red-600">{errors.payment_plan_custom_text.message}</p>
              )}
            </div>
          )}
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

