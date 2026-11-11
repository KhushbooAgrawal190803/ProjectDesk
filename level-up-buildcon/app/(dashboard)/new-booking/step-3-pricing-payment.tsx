'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { step3Schema, Step3Data, Step3FormValues } from '@/lib/validations/booking'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { ChevronRight, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useEffect, useState } from 'react'
import { flatBaseFromPricing } from '@/lib/booking/calculations'
import { formatInr, gstApplicablePaise, hundredthsToString, toHundredths } from '@/lib/booking/money'
import type { ParkingSpaceInput, PaymentEntryInput } from '@/lib/booking/persist-details'
import { PaymentEntriesFields } from './payment-entries-fields'

const getErrorMessage = (error: any): string | null => {
  if (!error) return null
  return typeof error.message === 'string' ? error.message : null
}

interface Step3PricingPaymentProps {
  data: Partial<Step3Data> & {
    super_builtup_area?: number
    parking_spaces?: ParkingSpaceInput[]
    payment_entries?: PaymentEntryInput[]
    pricing_mode?: 'rate' | 'lump_sum'
  }
  onUpdate: (data: Partial<Step3Data> & { parking_spaces: ParkingSpaceInput[]; payment_entries: PaymentEntryInput[] }) => void
  onNext: () => void
  onBack: () => void
  availableParking?: number
  availablePremiumParking?: number
}

export function Step3PricingPayment({
  data,
  onUpdate,
  onNext,
  onBack,
  availableParking = 79,
  availablePremiumParking = 27,
}: Step3PricingPaymentProps) {
  const superBuiltupArea = data.super_builtup_area
  const saved = summarizeParking(data.parking_spaces || [])
  const [mainCount, setMainCount] = useState(saved.main.count)
  const [secondaryCount, setSecondaryCount] = useState(saved.secondary.count)
  const [mainPrice, setMainPrice] = useState(saved.main.price)
  const [secondaryPrice, setSecondaryPrice] = useState(saved.secondary.price)
  const initialMain = saved.main.count
  const initialSecondary = saved.secondary.count
  const [paymentEntries, setPaymentEntries] = useState<PaymentEntryInput[]>(data.payment_entries || [])
  const [pricingMode, setPricingMode] = useState<'rate' | 'lump_sum'>(
    data.pricing_mode === 'lump_sum' || (!data.rate_per_sqft && data.total_cost) ? 'lump_sum' : 'rate'
  )

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<Step3FormValues, unknown, Step3Data>({
    resolver: zodResolver(step3Schema),
    defaultValues: data,
  })

  const ratePerSqft = watch('rate_per_sqft')
  const totalCost = watch('total_cost')
  const bookingAmountPaid = watch('booking_amount_paid')
  const paymentMode = watch('payment_mode')

  const rateBase = flatBaseFromPricing({ super_builtup_area: superBuiltupArea, rate_per_sqft: ratePerSqft })
  const basePaise = pricingMode === 'lump_sum'
    ? flatBaseFromPricing({ pricing_mode: 'lump_sum', total_cost: totalCost })
    : rateBase
  const gstPaise = gstApplicablePaise(bookingAmountPaid ?? 0)

  useEffect(() => {
    if (pricingMode === 'rate' && rateBase != null) setValue('total_cost', Number(hundredthsToString(rateBase)))
  }, [pricingMode, rateBase, setValue])

  useEffect(() => {
    if (gstPaise != null) setValue('gst_amount', Number(hundredthsToString(gstPaise)))
  }, [gstPaise, setValue])

  const onSubmit = (formData: Step3Data) => {
    const main = clampCount(mainCount, maxMain)
    const secondary = clampCount(secondaryCount, maxSecondary)
    const spaces = parkingSelection(main, mainPrice, secondary, secondaryPrice)
    const parkingTotal = spaces.reduce((sum, space) => sum + (toHundredths(space.price) ?? 0n), 0n)
    const received = paymentEntries
      .filter((entry) => entry.status !== 'expected')
      .reduce((sum, entry) => sum + (toHundredths(entry.amount) ?? 0n), 0n)
    const chosenBase = pricingMode === 'lump_sum'
      ? flatBaseFromPricing({ pricing_mode: 'lump_sum', total_cost: formData.total_cost })
      : flatBaseFromPricing({ super_builtup_area: superBuiltupArea, rate_per_sqft: formData.rate_per_sqft })
    onUpdate({
      ...formData,
      pricing_mode: pricingMode,
      rate_per_sqft: pricingMode === 'lump_sum' ? undefined : formData.rate_per_sqft,
      total_cost: chosenBase == null ? formData.total_cost : Number(hundredthsToString(chosenBase)),
      additional_parking: main,
      premium_parking: secondary,
      parking_spaces: spaces,
      payment_entries: paymentEntries,
      booking_amount_paid: paymentEntries.length ? Number(hundredthsToString(received)) : formData.booking_amount_paid,
      gst_collected: formData.gst_collected ?? 0,
      total_parking_charges: Number(hundredthsToString(parkingTotal)),
      total_property_value: chosenBase == null ? undefined : Number(hundredthsToString(chosenBase + parkingTotal)),
    } as Step3Data & { parking_spaces: ParkingSpaceInput[]; payment_entries: PaymentEntryInput[]; pricing_mode: 'rate' | 'lump_sum' })
    onNext()
  }

  const handleError = (formErrors: any) => {
    const messages = Object.values(formErrors).map((e: any) => e?.message).filter(Boolean)
    toast.error('Please fix the following:', {
      description: messages.join(', ') || 'Some required fields are missing',
    })
  }

  const maxMain = availableParking + initialMain
  const maxSecondary = availablePremiumParking + initialSecondary
  const main = clampCount(mainCount, maxMain)
  const secondary = clampCount(secondaryCount, maxSecondary)
  const parkingTotal = parkingSelection(main, mainPrice, secondary, secondaryPrice)
    .reduce((sum, space) => sum + (toHundredths(space.price) ?? 0n), 0n)

  return (
    <form onSubmit={handleSubmit(onSubmit, handleError)} className="space-y-6">
      {/* Pricing */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Pricing</h3>
        <div className="mb-4 flex gap-2 max-w-md">
          {([
            ['rate', 'Per sq.ft.'],
            ['lump_sum', 'Lump sum'],
          ] as const).map(([value, label]) => (
            <label key={value} className="flex-1">
              <input
                type="radio"
                className="peer sr-only"
                checked={pricingMode === value}
                onChange={() => setPricingMode(value)}
              />
              <div className="flex h-11 items-center justify-center rounded-lg border-2 border-zinc-200 cursor-pointer peer-checked:border-zinc-900 peer-checked:bg-zinc-50">
                <span className="font-medium">{label}</span>
              </div>
            </label>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pricingMode === 'rate' && (
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
          )}

          <div className="space-y-2">
            <Label htmlFor="total_cost">{pricingMode === 'lump_sum' ? 'Lump sum flat price (₹)' : 'Flat Base Price (₹)'}</Label>
            <Input
              id="total_cost"
              type="number"
              step="0.01"
              {...register('total_cost')}
              placeholder="0.00"
              readOnly={pricingMode === 'rate' && rateBase != null}
              className={pricingMode === 'rate' && rateBase != null ? 'bg-zinc-50' : ''}
            />
            {pricingMode === 'rate' && rateBase != null ? (
              <p className="text-xs text-zinc-500">
                Super built-up area × rate = {formatInr(rateBase)}. Parking is added separately.
              </p>
            ) : pricingMode === 'lump_sum' ? (
              <p className="text-xs text-zinc-500">
                This is the flat price. It is not calculated from the area. Parking is added separately. The payment schedule is of Total Consideration (flat + parking).
              </p>
            ) : (
              <p className="text-xs text-amber-600">Enter super built-up area in Step 1 and a rate to calculate the flat base price</p>
            )}
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
            {gstPaise != null && (
              <div className="rounded-md bg-blue-50 border border-blue-200 p-2">
                <p className="text-sm text-blue-700">
                  GST applicable (5%): <span className="font-semibold">{formatInr(gstPaise)}</span>
                </p>
                <p className="text-xs text-blue-600 mt-1">This is not marked as received.</p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="gst_collected">GST Collected (₹)</Label>
            <Input id="gst_collected" type="number" step="0.01" min="0" {...register('gst_collected')} placeholder="0.00" />
            <p className="text-xs text-zinc-500">
              Leave at 0 if GST will be paid later.
              {gstPaise != null && ` Outstanding: ${formatInr((gstPaise) - (toHundredths(watch('gst_collected')) ?? 0n))}`}
            </p>
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
              {paymentMode === 'UPI' && <option value="UPI">UPI</option>}
              <option value="Other">Others</option>
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
            <Label htmlFor="payment_mode_detail">
              {paymentMode === 'Other' ? 'Specify the other payment mode' : paymentMode === 'Cheque' ? 'Bank the cheque is drawn on' : 'Payment Details'}
            </Label>
            <Input
              id="payment_mode_detail"
              {...register('payment_mode_detail')}
              placeholder={paymentMode === 'Other' ? 'For example, demand draft' : paymentMode === 'Cheque' ? 'For example, State Bank of India' : 'Bank name, account details, etc.'}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Financing</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="finance_scenario">How the booking is funded</Label>
            <select id="finance_scenario" {...register('finance_scenario')} className="flex h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm">
              <option value="purchaser">Scenario 1: entire booking amount paid by the purchaser(s)</option>
              <option value="split_50_50">Scenario 2: purchaser pays 10% of the total consideration, bank funds the other 10% at booking</option>
              <option value="split_10_90">Scenario 3: purchaser pays 10% and bank pays 90% of each instalment</option>
            </select>
            <p className="text-xs text-zinc-500">This decides the booking-amount wording in Article I of the Agreement for Sale.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="finance_bank_name">Bank name</Label>
            <Input id="finance_bank_name" {...register('finance_bank_name')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="finance_bank_branch">Branch</Label>
            <Input id="finance_bank_branch" {...register('finance_bank_branch')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="finance_loan_status">Loan status</Label>
            <select id="finance_loan_status" {...register('finance_loan_status')} className="flex h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm">
              <option value="">Select</option>
              <option value="Sanctioned">Sanctioned</option>
              <option value="Not yet sanctioned">Not yet sanctioned</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="finance_sanction_ref">Sanction reference</Label>
            <Input id="finance_sanction_ref" {...register('finance_sanction_ref')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="finance_sanction_amount">Sanction amount (₹)</Label>
            <Input id="finance_sanction_amount" type="number" min="0" step="0.01" {...register('finance_sanction_amount')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="finance_sanction_date">Sanction date</Label>
            <Input id="finance_sanction_date" type="date" {...register('finance_sanction_date')} />
          </div>
        </div>
      </div>

      <PaymentEntriesFields entries={paymentEntries} onChange={setPaymentEntries} />

      {/* Parking */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Parking</h3>
          <p className="text-xs text-zinc-500 mt-1">
            {availableParking} of 79 main spaces still available · {availablePremiumParking} of 27 secondary spaces still available · 106 total
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="main_parking_count">Main parking</Label>
            <Input id="main_parking_count" type="number" min="0" max={maxMain} step="1" value={mainCount} onChange={(e) => setMainCount(clampCount(e.target.value, maxMain))} />
            <p className="text-xs text-zinc-500">Up to {maxMain}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="main_parking_price">Main parking price (₹)</Label>
            <Input id="main_parking_price" type="number" min="0" step="0.01" value={mainPrice} onChange={(e) => setMainPrice(e.target.value)} placeholder="0.00" disabled={main === 0} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="secondary_parking_count">Secondary parking</Label>
            <Input id="secondary_parking_count" type="number" min="0" max={maxSecondary} step="1" value={secondaryCount} onChange={(e) => setSecondaryCount(clampCount(e.target.value, maxSecondary))} />
            <p className="text-xs text-zinc-500">Up to {maxSecondary}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="secondary_parking_price">Secondary parking price (₹)</Label>
            <Input id="secondary_parking_price" type="number" min="0" step="0.01" value={secondaryPrice} onChange={(e) => setSecondaryPrice(e.target.value)} placeholder="0.00" disabled={secondary === 0} />
          </div>
        </div>
        <p className="text-sm text-zinc-700">
          Parking charges: <span className="font-semibold">{formatInr(parkingTotal)}</span>
          {basePaise != null && (
            <> · Total Consideration: <span className="font-semibold">{formatInr(basePaise + parkingTotal)}</span></>
          )}
        </p>
      </div>

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

function clampCount(value: number | string, max: number) {
  const parsed = Math.floor(Number(value))
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.min(parsed, max)
}

function summarizeParking(spaces: ParkingSpaceInput[]) {
  const side = (kind: ParkingSpaceInput['kind']) => {
    const rows = spaces.filter((space) => space.kind === kind)
    const count = rows.reduce((sum, space) => sum + Math.max(1, Math.floor(Number(space.quantity ?? 1)) || 1), 0)
    const price = rows.reduce((sum, space) => sum + (toHundredths(space.price) ?? 0n), 0n)
    return { count, price: rows.length ? hundredthsToString(price) : '' }
  }
  return { main: side('main'), secondary: side('secondary') }
}

function parkingSelection(main: number, mainPrice: string, secondary: number, secondaryPrice: string): ParkingSpaceInput[] {
  const rows: ParkingSpaceInput[] = []
  if (main > 0) rows.push({ id: crypto.randomUUID(), kind: 'main', quantity: main, price: mainPrice || '0' })
  if (secondary > 0) rows.push({ id: crypto.randomUUID(), kind: 'secondary', quantity: secondary, price: secondaryPrice || '0' })
  return rows
}

