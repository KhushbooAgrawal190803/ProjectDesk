'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { step3Schema, Step3Data, Step3FormValues } from '@/lib/validations/booking'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateField } from '@/components/ui/date-field'
import { Label } from '@/components/ui/label'
import { ChevronRight, ChevronLeft, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { useEffect, useMemo, useState } from 'react'
import { flatBaseFromPricing } from '@/lib/booking/calculations'
import { financeContributions, type FinanceScenario } from '@/lib/booking/consideration'
import { formatInr, gstApplicablePaise, hundredthsToString, percentOfPaise, toHundredths } from '@/lib/booking/money'
import { formatPersonName } from '@/lib/booking/person'
import { resolveSchedule, standardScheduleRows, type ScheduleRowInput } from '@/lib/booking/schedule'
import type { CoApplicantInput, ParkingSpaceInput, PaymentEntryInput } from '@/lib/booking/persist-details'
import { entryCountsAsReceived } from '@/lib/ledger/model'
import { selectClass, type PayerOption } from '@/components/payments/payment-form-fields'
import { PaymentsReceived } from './payments-received'

const GST_PERCENT = 5

const getErrorMessage = (error: any): string | null => {
  if (!error) return null
  return typeof error.message === 'string' ? error.message : null
}

function storedSplit(data: {
  finance_scenario?: string | null
  finance_purchaser_percent?: number | null
  finance_bank_percent?: number | null
  finance_split_scope?: string | null
}) {
  if (data.finance_scenario === 'split_10_90') return { purchaser: '10', bank: '90', scope: 'every' as const }
  if (data.finance_scenario === 'split_50_50') return { purchaser: '50', bank: '50', scope: 'booking' as const }
  if (data.finance_scenario === 'split') {
    return {
      purchaser: data.finance_purchaser_percent == null ? '' : String(data.finance_purchaser_percent),
      bank: data.finance_bank_percent == null ? '' : String(data.finance_bank_percent),
      scope: data.finance_split_scope === 'booking' ? 'booking' as const : 'every' as const,
    }
  }
  return { purchaser: '', bank: '', scope: 'every' as const }
}

export const LOAN_STATUSES = ['Proposed', 'Applied', 'Sanctioned', 'Partially Disbursed', 'Fully Disbursed'] as const

interface Step3PricingPaymentProps {
  data: Partial<Step3Data> & {
    super_builtup_area?: number
    parking_spaces?: ParkingSpaceInput[]
    payment_entries?: PaymentEntryInput[]
    pricing_mode?: 'rate' | 'lump_sum'
    coapplicants?: CoApplicantInput[]
    applicant_name?: string
    applicant_salutation?: string
    schedule_mode?: 'standard' | 'custom'
    schedule_rows?: ScheduleRowInput[]
  }
  onUpdate: (data: Partial<Step3Data> & { parking_spaces: ParkingSpaceInput[]; payment_entries: PaymentEntryInput[] }) => void
  onNext: () => void
  onBack: () => void
  availableParking?: number
  availablePremiumParking?: number
  ledgerReady?: boolean
}

/** Bookings saved before payments were itemised keep one payment built from the booking fields. */
function initialPayments(data: Step3PricingPaymentProps['data']): PaymentEntryInput[] {
  const entries = (data.payment_entries || []).filter((entry) => entry.status !== 'expected')
  if (entries.length || data.payment_entries?.length) return entries
  const paid = toHundredths(data.booking_amount_paid) ?? 0n
  if (paid <= 0n) return []
  return [{
    id: crypto.randomUUID(),
    payer_kind: 'applicant',
    payer_name: formatPersonName(data.applicant_salutation, data.applicant_name),
    amount: hundredthsToString(paid),
    gst_amount: hundredthsToString(toHundredths(data.gst_collected) ?? 0n),
    payment_mode: data.payment_mode || 'NEFT_RTGS',
    payment_mode_detail: data.payment_mode === 'Other' ? data.payment_mode_detail || '' : '',
    reference_no: data.txn_or_cheque_no || '',
    payment_date: data.txn_date || '',
    originating_bank: data.payment_mode === 'Cheque' ? data.payment_mode_detail || '' : '',
    status: 'received',
    notes: '',
  }]
}

function initialExpected(data: Step3PricingPaymentProps['data']) {
  const expected = (data.payment_entries || []).filter((entry) => entry.status === 'expected')
  const total = expected.reduce((sum, entry) => sum + (toHundredths(entry.amount) ?? 0n), 0n)
  return {
    id: expected[0]?.id || crypto.randomUUID(),
    amount: expected.length ? hundredthsToString(total) : '',
    date: expected[0]?.payment_date || '',
  }
}

export function Step3PricingPayment({
  data,
  onUpdate,
  onNext,
  onBack,
  availableParking = 79,
  availablePremiumParking = 27,
  ledgerReady = false,
}: Step3PricingPaymentProps) {
  const superBuiltupArea = data.super_builtup_area
  const saved = summarizeParking(data.parking_spaces || [])
  const [mainCount, setMainCount] = useState(saved.main.count)
  const [secondaryCount, setSecondaryCount] = useState(saved.secondary.count)
  const [mainPrice, setMainPrice] = useState(saved.main.price)
  const [secondaryPrice, setSecondaryPrice] = useState(saved.secondary.price)
  const initialMain = saved.main.count
  const initialSecondary = saved.secondary.count
  const [payments, setPayments] = useState<PaymentEntryInput[]>(() => initialPayments(data))
  const initialSplit = storedSplit(data)
  const [purchaserPercent, setPurchaserPercent] = useState(initialSplit.purchaser)
  const [bankPercent, setBankPercent] = useState(initialSplit.bank)
  const [splitScope, setSplitScope] = useState<'booking' | 'every'>(initialSplit.scope)
  const [expected, setExpected] = useState(() => initialExpected(data))
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
    defaultValues: {
      ...data,
      finance_scenario: data.finance_scenario && data.finance_scenario !== 'purchaser' ? 'split' : 'purchaser',
    },
  })

  const ratePerSqft = watch('rate_per_sqft')
  const totalCost = watch('total_cost')
  const scenario = (watch('finance_scenario') || 'purchaser') as FinanceScenario
  const loanStatus = watch('finance_loan_status')
  const bankName = watch('finance_bank_name')
  const originalScenario = data.finance_scenario || 'purchaser'
  const typedSame = purchaserPercent === initialSplit.purchaser && bankPercent === initialSplit.bank && splitScope === initialSplit.scope
  const scenarioToSave: FinanceScenario = scenario === 'purchaser'
    ? 'purchaser'
    : (originalScenario === 'split_10_90' || originalScenario === 'split_50_50') && typedSame
      ? originalScenario
      : 'split'
  const financed = scenario !== 'purchaser'
  const splitInput = {
    purchaserPercent: Number(purchaserPercent),
    bankPercent: Number(bankPercent),
    scope: splitScope,
  }

  const rateBase = flatBaseFromPricing({ super_builtup_area: superBuiltupArea, rate_per_sqft: ratePerSqft })
  const basePaise = pricingMode === 'lump_sum'
    ? flatBaseFromPricing({ pricing_mode: 'lump_sum', total_cost: totalCost })
    : rateBase

  useEffect(() => {
    if (pricingMode === 'rate' && rateBase != null) setValue('total_cost', Number(hundredthsToString(rateBase)))
  }, [pricingMode, rateBase, setValue])

  const maxMain = availableParking + initialMain
  const maxSecondary = availablePremiumParking + initialSecondary
  const main = clampCount(mainCount, maxMain)
  const secondary = clampCount(secondaryCount, maxSecondary)
  const parkingTotal = parkingSelection(main, mainPrice, secondary, secondaryPrice)
    .reduce((sum, space) => sum + (toHundredths(space.price) ?? 0n), 0n)
  const considerationPaise = basePaise == null ? null : basePaise + parkingTotal
  const considerationGst = considerationPaise == null ? null : percentOfPaise(considerationPaise, GST_PERCENT) ?? 0n

  const bookingInstallment = useMemo(() => {
    if (considerationPaise == null || considerationPaise <= 0n) return null
    const custom = data.schedule_mode === 'custom' && data.schedule_rows?.length
      ? resolveSchedule(considerationPaise, data.schedule_rows)
      : null
    const resolved = custom?.balanced ? custom : resolveSchedule(considerationPaise, standardScheduleRows())
    return resolved.rows[0]?.calculatedPaise ?? null
  }, [considerationPaise, data.schedule_mode, data.schedule_rows])
  const shares = bookingInstallment != null && considerationPaise != null
    ? financeContributions(bookingInstallment, considerationPaise, scenarioToSave, 'booking', splitInput)
    : null

  useEffect(() => {
    if (financed && !expected.amount && shares && shares.bankPaise > 0n) {
      setExpected((current) => ({ ...current, amount: hundredthsToString(shares.bankPaise) }))
    }
  }, [financed, shares, expected.amount])

  const payers: PayerOption[] = useMemo(() => {
    const applicant = formatPersonName(data.applicant_salutation, data.applicant_name) || 'Primary applicant'
    const options: PayerOption[] = [{ key: 'applicant', label: `${applicant} (primary applicant)`, kind: 'applicant', name: applicant }]
    for (const person of data.coapplicants || []) {
      const name = formatPersonName(person.salutation, person.name) || 'Co-applicant'
      options.push({ key: `coapplicant:${person.id}`, label: `${name} (co-applicant)`, kind: 'coapplicant', coapplicantId: person.id, name })
    }
    if (financed || payments.some((entry) => entry.payer_kind === 'bank')) {
      options.push({ key: 'bank', label: bankName ? `${bankName} (bank)` : 'Financing bank', kind: 'bank', name: bankName || '' })
    }
    options.push({ key: 'other', label: 'Someone else', kind: 'other', name: '' })
    return options
  }, [data.applicant_salutation, data.applicant_name, data.coapplicants, financed, payments, bankName])

  const sums = useMemo(() => {
    let principal = 0n
    let gst = 0n
    let pending = 0n
    let purchaser = 0n
    let bank = 0n
    for (const entry of payments) {
      const amount = toHundredths(entry.amount) ?? 0n
      const tax = toHundredths(entry.gst_amount) ?? 0n
      if (entryCountsAsReceived(entry.status)) {
        principal += amount
        gst += tax
        if (entry.payer_kind === 'bank') bank += amount
        else purchaser += amount
      } else if (entry.status === 'pending_clearance') {
        pending += amount + tax
      }
    }
    return { principal, gst, pending, purchaser, bank }
  }, [payments])
  const expectedPaise = financed ? toHundredths(expected.amount) ?? 0n : 0n
  const installmentGst = bookingInstallment == null ? null : percentOfPaise(bookingInstallment, GST_PERCENT) ?? 0n
  const gstAllowed = gstApplicablePaise(hundredthsToString(sums.principal)) ?? 0n

  const reconciliation = useMemo(() => {
    if (bookingInstallment == null || installmentGst == null) return null
    const remainingPrincipal = bookingInstallment - sums.principal - expectedPaise
    const warnings: string[] = []
    if (sums.gst > gstAllowed) warnings.push(`GST entered (${formatInr(sums.gst)}) is more than 5% of the amount received (${formatInr(gstAllowed)}).`)
    if (shares && financed && sums.purchaser < shares.purchaserPaise) {
      warnings.push(`Purchaser share of the booking installment is ${formatInr(shares.purchaserPaise)}; ${formatInr(sums.purchaser)} is received from the purchaser side.`)
    }
    if (shares && financed && sums.bank + expectedPaise > shares.bankPaise && shares.bankPaise > 0n) {
      warnings.push(`Bank money received plus expected (${formatInr(sums.bank + expectedPaise)}) is more than the bank share (${formatInr(shares.bankPaise)}).`)
    }
    if (financed && sums.bank > 0n && expectedPaise > 0n) {
      warnings.push('Bank money is recorded as received and also as expected. Reduce the expected amount by what has arrived, so it is not counted twice.')
    }
    return {
      remainingPrincipal: remainingPrincipal > 0n ? remainingPrincipal : 0n,
      remainingGst: installmentGst > sums.gst ? installmentGst - sums.gst : 0n,
      overpayment: sums.principal > bookingInstallment ? sums.principal - bookingInstallment : 0n,
      warnings,
    }
  }, [bookingInstallment, installmentGst, sums, expectedPaise, gstAllowed, shares, financed])

  const onSubmit = (formData: Step3Data) => {
    if (sums.gst > gstAllowed) {
      toast.error('GST collected cannot exceed 5% of the amount received')
      return
    }
    if (scenarioToSave === 'split') {
      const purchaserShare = Math.round(Number(purchaserPercent) * 100)
      const bankShare = Math.round(Number(bankPercent) * 100)
      if (!Number.isFinite(purchaserShare) || !Number.isFinite(bankShare) || purchaserShare + bankShare !== 10000) {
        toast.error('Purchaser and bank percentages must add up to 100')
        return
      }
    }
    const spaces = parkingSelection(main, mainPrice, secondary, secondaryPrice)
    const chosenBase = pricingMode === 'lump_sum'
      ? flatBaseFromPricing({ pricing_mode: 'lump_sum', total_cost: formData.total_cost })
      : flatBaseFromPricing({ super_builtup_area: superBuiltupArea, rate_per_sqft: formData.rate_per_sqft })
    const expectedEntry: PaymentEntryInput[] = financed && expectedPaise > 0n
      ? [{
          id: expected.id,
          payer_kind: 'bank',
          payer_name: formData.finance_bank_name || '',
          amount: hundredthsToString(expectedPaise),
          payment_mode: 'NEFT_RTGS',
          payment_date: expected.date || '',
          originating_bank: formData.finance_bank_name || '',
          status: 'expected',
        }]
      : []
    const first = payments.find((entry) => entryCountsAsReceived(entry.status)) || payments[0]
    onUpdate({
      ...formData,
      finance_scenario: scenarioToSave,
      finance_purchaser_percent: scenarioToSave === 'split' ? Number(purchaserPercent) : undefined,
      finance_bank_percent: scenarioToSave === 'split' ? Number(bankPercent) : undefined,
      finance_split_scope: scenarioToSave === 'split' ? splitScope : '',
      finance_bank_name: financed ? formData.finance_bank_name : '',
      finance_bank_branch: financed ? formData.finance_bank_branch : '',
      finance_bank_address: financed ? formData.finance_bank_address : '',
      finance_loan_status: financed ? formData.finance_loan_status : '',
      finance_sanction_ref: financed ? formData.finance_sanction_ref : '',
      finance_sanction_amount: financed ? formData.finance_sanction_amount : undefined,
      finance_sanction_date: financed ? formData.finance_sanction_date : '',
      pricing_mode: pricingMode,
      rate_per_sqft: pricingMode === 'lump_sum' ? undefined : formData.rate_per_sqft,
      total_cost: chosenBase == null ? formData.total_cost : Number(hundredthsToString(chosenBase)),
      additional_parking: main,
      premium_parking: secondary,
      parking_spaces: spaces,
      payment_entries: [...payments, ...expectedEntry],
      booking_amount_paid: Number(hundredthsToString(sums.principal)),
      gst_amount: Number(hundredthsToString(gstAllowed)),
      gst_collected: Number(hundredthsToString(sums.gst)),
      payment_mode: (first?.payment_mode as Step3Data['payment_mode']) || undefined,
      payment_mode_detail: first ? (first.payment_mode === 'Cheque' ? first.originating_bank || '' : first.payment_mode_detail || '') : '',
      txn_or_cheque_no: first?.reference_no || '',
      txn_date: first?.payment_date || '',
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

  return (
    <form onSubmit={handleSubmit(onSubmit, handleError)} className="space-y-10">
      {/* Section A */}
      <section className="space-y-6">
        <SectionTitle letter="A" title="Property price" detail="Flat price and parking make the Total Consideration. GST is shown separately." />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
          <div className="space-y-6">
            <div className="flex max-w-md gap-2">
              {([
                ['rate', 'Per sq.ft.'],
                ['lump_sum', 'Lump sum'],
              ] as const).map(([value, label]) => (
                <label key={value} className="flex-1">
                  <input type="radio" className="peer sr-only" checked={pricingMode === value} onChange={() => setPricingMode(value)} />
                  <div className="flex h-11 cursor-pointer items-center justify-center rounded-lg border-2 border-zinc-200 peer-checked:border-zinc-900 peer-checked:bg-zinc-50">
                    <span className="font-medium">{label}</span>
                  </div>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {pricingMode === 'rate' && (
                <div className="space-y-2">
                  <Label htmlFor="rate_per_sqft">Rate per sq.ft. (₹)</Label>
                  <Input id="rate_per_sqft" type="number" step="any" inputMode="decimal" {...register('rate_per_sqft')} placeholder="e.g., 5000" />
                  {errors.rate_per_sqft && <p className="text-sm text-red-600">{getErrorMessage(errors.rate_per_sqft)}</p>}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="total_cost">{pricingMode === 'lump_sum' ? 'Lump-sum flat price (₹)' : 'Flat base price (₹)'}</Label>
                <Input
                  id="total_cost"
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  {...register('total_cost')}
                  placeholder="0.00"
                  readOnly={pricingMode === 'rate' && rateBase != null}
                  className={pricingMode === 'rate' && rateBase != null ? 'bg-zinc-50' : ''}
                />
                {pricingMode === 'rate' && rateBase != null ? (
                  <p className="text-xs text-zinc-500">Super built-up area × rate = {formatInr(rateBase)}.</p>
                ) : pricingMode === 'lump_sum' ? (
                  <p className="text-xs text-zinc-500">The agreed flat price. It is not calculated from the area.</p>
                ) : (
                  <p className="text-xs text-amber-600">Enter super built-up area in Step 1 and a rate to calculate the flat base price.</p>
                )}
                {errors.total_cost && <p className="text-sm text-red-600">{getErrorMessage(errors.total_cost)}</p>}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <h4 className="font-semibold text-zinc-900">Parking</h4>
                <p className="mt-1 text-xs text-zinc-500">
                  {availableParking} of 79 main and {availablePremiumParking} of 27 secondary spaces available
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
            </div>
          </div>

          <aside className="h-fit rounded-xl border border-zinc-200 bg-zinc-50 p-4 lg:sticky lg:top-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Price summary</p>
            <dl className="mt-3 space-y-2 text-sm">
              <SummaryRow
                label="Flat price"
                value={basePaise == null ? '—' : `${formatInr(basePaise)} · GST ${formatInr(percentOfPaise(basePaise, GST_PERCENT) ?? 0n)}`}
              />
              <SummaryRow label={`Parking (${main + secondary} space${main + secondary === 1 ? '' : 's'})`} value={formatInr(parkingTotal)} />
              <div className="border-t border-zinc-200 pt-2">
                <SummaryRow
                  label="Total Consideration"
                  value={considerationPaise == null || considerationGst == null ? '—' : `${formatInr(considerationPaise)} · GST ${formatInr(considerationGst)}`}
                  strong
                />
              </div>
              <SummaryRow label={`GST @ ${GST_PERCENT}%`} value={considerationGst == null ? '—' : formatInr(considerationGst)} />
              <SummaryRow
                label="Total incl. GST"
                value={considerationPaise == null || considerationGst == null ? '—' : formatInr(considerationPaise + considerationGst)}
              />
            </dl>
          </aside>
        </div>
      </section>

      {/* Section B */}
      <section className="space-y-6">
        <SectionTitle letter="B" title="Booking payment and financing" detail="Who pays the booking installment, and what has been received." />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2" role="radiogroup" aria-label="Financing option">
          <label className="block cursor-pointer">
            <input type="radio" value="purchaser" className="peer sr-only" {...register('finance_scenario')} />
            <div className="h-full rounded-lg border-2 border-zinc-200 p-3 peer-checked:border-zinc-900 peer-checked:bg-zinc-50 peer-focus-visible:ring-2 peer-focus-visible:ring-zinc-900">
              <p className="text-sm font-medium text-zinc-900">Purchaser-funded</p>
              <p className="mt-1 text-xs text-zinc-500">The purchaser(s) pay the booking installment. Several contributors can pay.</p>
            </div>
          </label>
          <label className="block cursor-pointer">
            <input type="radio" value="split" className="peer sr-only" {...register('finance_scenario')} />
            <div className="h-full rounded-lg border-2 border-zinc-200 p-3 peer-checked:border-zinc-900 peer-checked:bg-zinc-50 peer-focus-visible:ring-2 peer-focus-visible:ring-zinc-900">
              <p className="text-sm font-medium text-zinc-900">Bank share</p>
              <p className="mt-1 text-xs text-zinc-500">Type the purchaser percentage and the bank percentage. They must add up to 100.</p>
            </div>
          </label>
        </div>

        {scenario === 'split' && (
          <div className="grid grid-cols-1 gap-4 rounded-lg border border-zinc-200 p-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="finance_purchaser_percent">Purchaser pays (%)</Label>
              <Input id="finance_purchaser_percent" type="number" min="0" max="100" step="0.01" value={purchaserPercent} onChange={(event) => setPurchaserPercent(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="finance_bank_percent">Bank pays (%)</Label>
              <Input id="finance_bank_percent" type="number" min="0" max="100" step="0.01" value={bankPercent} onChange={(event) => setBankPercent(event.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <p className="text-sm font-medium text-zinc-900">This split applies to</p>
              <div className="flex flex-col gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" name="finance_split_scope" checked={splitScope === 'booking'} onChange={() => setSplitScope('booking')} />
                  The booking installment only. Later installments are paid by the purchaser.
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="finance_split_scope" checked={splitScope === 'every'} onChange={() => setSplitScope('every')} />
                  Every installment.
                </label>
              </div>
            </div>
          </div>
        )}

        {bookingInstallment != null && shares && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Booking installment" value={formatInr(bookingInstallment)} hint={`+ GST ${formatInr(installmentGst ?? 0n)}`} />
            <Stat label="Purchaser share" value={formatInr(shares.purchaserPaise)} />
            <Stat label="Bank share" value={formatInr(shares.bankPaise)} hint={financed ? undefined : 'Not financed'} />
          </div>
        )}

        {financed && (
          <div className="space-y-4 rounded-lg border border-zinc-200 p-4">
            <div>
              <h4 className="font-semibold text-zinc-900">Bank financing</h4>
              <p className="text-xs text-zinc-500">Expected bank money stays outstanding until it actually arrives. It is never counted as received.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="finance_bank_name">Bank name</Label>
                <Input id="finance_bank_name" {...register('finance_bank_name')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="finance_bank_branch">Branch</Label>
                <Input id="finance_bank_branch" {...register('finance_bank_branch')} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="finance_bank_address">Bank address (optional)</Label>
                <Input id="finance_bank_address" {...register('finance_bank_address')} disabled={!ledgerReady} placeholder={ledgerReady ? '' : 'Available after the payment ledger update is installed'} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="finance_loan_status">Loan status</Label>
                <select id="finance_loan_status" {...register('finance_loan_status')} className={selectClass}>
                  <option value="">Select</option>
                  {LOAN_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                  {loanStatus && !(LOAN_STATUSES as readonly string[]).includes(loanStatus) && <option value={loanStatus}>{loanStatus}</option>}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="finance_sanction_ref">Sanction number (optional)</Label>
                <Input id="finance_sanction_ref" {...register('finance_sanction_ref')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="finance_sanction_date">Sanction date (optional)</Label>
                <DateField id="finance_sanction_date" value={watch('finance_sanction_date') || ''} onChange={(value) => setValue('finance_sanction_date', value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="finance_sanction_amount">Sanction amount (optional, ₹)</Label>
                <Input id="finance_sanction_amount" type="number" min="0" step="0.01" inputMode="decimal" {...register('finance_sanction_amount')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expected_disbursement">Expected disbursement for the booking installment (₹)</Label>
                <Input
                  id="expected_disbursement"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={expected.amount}
                  onChange={(event) => setExpected((current) => ({ ...current, amount: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expected_disbursement_date">Expected disbursement date (optional)</Label>
                <DateField
                  id="expected_disbursement_date"
                  value={expected.date.slice(0, 10)}
                  onChange={(value) => setExpected((current) => ({ ...current, date: value }))}
                />
              </div>
            </div>
          </div>
        )}

        <PaymentsReceived entries={payments} onChange={setPayments} payers={payers} ledgerReady={ledgerReady} />

        <div className="rounded-lg border border-zinc-200">
          <div className="border-b border-zinc-200 px-4 py-3">
            <h4 className="font-semibold text-zinc-900">Booking installment reconciliation</h4>
          </div>
          {reconciliation == null || bookingInstallment == null ? (
            <p className="px-4 py-4 text-sm text-zinc-500">Enter the price to see what is due for the booking installment.</p>
          ) : (
            <div className="space-y-3 p-4">
              <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                <SummaryRow label="Installment due" value={formatInr(bookingInstallment)} />
                <SummaryRow label="GST due on installment" value={formatInr(installmentGst ?? 0n)} />
                <SummaryRow label="Principal received" value={formatInr(sums.principal)} />
                <SummaryRow label="GST received" value={formatInr(sums.gst)} />
                <SummaryRow label="Total received" value={formatInr(sums.principal + sums.gst)} strong />
                <SummaryRow label="Pending clearance" value={formatInr(sums.pending)} />
                {financed && <SummaryRow label="Expected bank contribution" value={formatInr(expectedPaise)} />}
                <SummaryRow
                  label={financed ? 'Still unpaid, apart from the expected bank money' : 'Still unpaid'}
                  value={formatInr(reconciliation.remainingPrincipal + reconciliation.remainingGst)}
                  strong
                />
                {reconciliation.overpayment > 0n && (
                  <SummaryRow label="More than the booking installment" value={formatInr(reconciliation.overpayment)} />
                )}
              </dl>
              {reconciliation.overpayment > 0n && (
                <p className="text-xs text-zinc-500">The extra amount is applied to the next installments in order when the booking is submitted.</p>
              )}
              {reconciliation.warnings.map((warning) => (
                <p key={warning} className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {warning}
                </p>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="flex justify-between border-t border-zinc-200 pt-4">
        <Button type="button" variant="outline" onClick={onBack} className="gap-2">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <Button type="submit" className="gap-2">
          Continue
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </form>
  )
}

function SectionTitle({ letter, title, detail }: { letter: string; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">{letter}</span>
      <div>
        <h3 className="text-lg font-semibold text-zinc-900">{title}</h3>
        <p className="text-sm text-zinc-500">{detail}</p>
      </div>
    </div>
  )
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-zinc-600">{label}</dt>
      <dd className={`tabular-nums ${strong ? 'font-semibold text-zinc-900' : 'text-zinc-900'}`}>{value}</dd>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 px-4 py-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 font-semibold tabular-nums text-zinc-900">{value}</p>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
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
