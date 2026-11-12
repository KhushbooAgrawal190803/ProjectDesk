import type { SupabaseClient } from '@supabase/supabase-js'
import { getUnitBoundaries } from '@/lib/data/flat-boundaries'
import { getUndividedLandShare } from '@/lib/data/land-share'
import { formatPostalAddress, type PostalAddressInput } from './address'
import { flatBaseFromPricing } from './calculations'
import { considerationOf } from './consideration'
import {
  gstApplicablePaise,
  hundredthsToString,
  toHundredths,
} from './money'
import { resolveSchedule, standardScheduleRows, type ScheduleRowInput } from './schedule'
import { entryCountsAsReceived, normalizeEntryStatus, type EntryStatus } from '@/lib/ledger/model'

export interface ParkingSpaceInput {
  id: string
  kind: 'main' | 'secondary'
  /** How many spaces this price covers. Defaults to 1. */
  quantity?: number | null
  label?: string | null
  price?: number | string | null
}

export interface PaymentEntryInput {
  id: string
  payer_kind: 'applicant' | 'coapplicant' | 'bank' | 'other'
  payer_coapplicant_id?: string | null
  payer_name?: string | null
  amount?: number | string | null
  payment_mode?: string | null
  payment_mode_detail?: string | null
  reference_no?: string | null
  payment_date?: string | null
  originating_bank?: string | null
  status?: EntryStatus | null
  /** GST included in this payment. */
  gst_amount?: number | string | null
  notes?: string | null
}

/** Booking columns added by migration 010. Dropped from writes until it is run. */
export const LEDGER_BOOKING_COLUMNS = ['finance_bank_address'] as const

export function withoutLedgerColumns<T extends Record<string, unknown>>(patch: T): T {
  const copy = { ...patch }
  for (const key of LEDGER_BOOKING_COLUMNS) delete copy[key]
  return copy
}

export interface CoApplicantInput extends PostalAddressInput {
  id: string
  salutation?: string | null
  name?: string | null
  father_or_spouse?: string | null
  relationship?: string | null
  occupation?: string | null
  mobile?: string | null
  email?: string | null
  pan?: string | null
  aadhaar?: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function text(value: unknown): string | null {
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed ? trimmed : null
}

function addressOf(input: Record<string, unknown>, prefix: string): PostalAddressInput {
  const key = (name: string) => (prefix ? input[`${prefix}${name}`] : input[name]) as string | null | undefined
  return {
    address_line1: key('address_line1'),
    address_line2: key('address_line2'),
    city: key('city'),
    state: key('state'),
    pin_code: key('pin_code'),
    country: key('country'),
  }
}

export function buildBookingScalars(
  input: Record<string, unknown>,
  mode: 'draft' | 'submit'
): Record<string, unknown> {
  const boundaries = getUnitBoundaries(text(input.unit_no))
  const applicantAddress = addressOf(input, 'applicant_')
  if (!text(applicantAddress.country)) applicantAddress.country = 'India'

  const base = flatBaseFromPricing(input)

  const parking = Array.isArray(input.parking_spaces) ? (input.parking_spaces as ParkingSpaceInput[]) : []
  let mainCount = 0
  let secondaryCount = 0
  const parkingPaise: bigint[] = []
  if (mode === 'submit' || Array.isArray(input.parking_spaces)) {
    for (const space of parking) {
      if (space.kind !== 'main' && space.kind !== 'secondary') {
        throw new Error('Each parking space must be main or secondary')
      }
      const quantity = Math.floor(Number(space.quantity ?? 1))
      if (!Number.isFinite(quantity) || quantity < 1) continue
      const price = toHundredths(space.price)
      if (price == null || price < 0n) {
        parkingPaise.push(0n)
        if (space.kind === 'main') mainCount += quantity
        else secondaryCount += quantity
        continue
      }
      if (space.kind === 'main') mainCount += quantity
      else secondaryCount += quantity
      parkingPaise.push(price)
    }
  }
  const parkingTotal = parkingPaise.reduce((sum, value) => sum + value, 0n)

  const paymentEntries = Array.isArray(input.payment_entries) ? (input.payment_entries as PaymentEntryInput[]) : null
  const counted = paymentEntries ? paymentEntries.filter((entry) => entryCountsAsReceived(entry.status)) : null
  const receivedFromEntries = counted
    ? counted.reduce((sum, entry) => sum + (toHundredths(entry.amount) ?? 0n), 0n)
    : null
  const gstFromEntries = counted && counted.some((entry) => (toHundredths(entry.gst_amount) ?? 0n) > 0n)
    ? counted.reduce((sum, entry) => sum + (toHundredths(entry.gst_amount) ?? 0n), 0n)
    : null
  const paid = receivedFromEntries ?? toHundredths(input.booking_amount_paid ?? 0) ?? 0n
  if (paid < 0n) throw new Error('Booking amount cannot be negative')
  const gst = gstApplicablePaise(hundredthsToString(paid)) ?? 0n
  const collected = gstFromEntries ?? toHundredths(input.gst_collected ?? 0) ?? 0n
  if (collected < 0n) throw new Error('GST collected cannot be negative')
  if (collected > gst) throw new Error('GST collected cannot exceed the GST applicable')

  const nocRequired = input.noc_required === true || input.noc_required === 'true'
  const bankAddress = addressOf(input, 'noc_bank_')
  if (!text(bankAddress.country)) bankAddress.country = 'India'
  const scheduleMode = input.schedule_mode === 'custom' ? 'custom' : 'standard'

  const coapplicants = Array.isArray(input.coapplicants) ? (input.coapplicants as CoApplicantInput[]) : []

  const formatted =
    formatPostalAddress({
      ...applicantAddress,
      country: text(applicantAddress.country) || 'India',
    }) || text(input.applicant_address)
  const patch: Record<string, unknown> = {
    boundary_east: boundaries?.east ?? null,
    boundary_west: boundaries?.west ?? null,
    boundary_north: boundaries?.north ?? null,
    boundary_south: boundaries?.south ?? null,
    applicant_address_line1: text(applicantAddress.address_line1),
    applicant_address_line2: text(applicantAddress.address_line2),
    applicant_city: text(applicantAddress.city),
    applicant_state: text(applicantAddress.state),
    applicant_pin_code: text(applicantAddress.pin_code),
    applicant_country: text(applicantAddress.country) || 'India',
    applicant_address: formatted,
    applicant_salutation: text(input.applicant_salutation),
    applicant_relationship: text(input.applicant_relationship),
    applicant_occupation: text(input.applicant_occupation),
    undivided_land_share: getUndividedLandShare(text(input.project_name) || 'Anandam', text(input.unit_no)),
    finance_scenario: text(input.finance_scenario) || 'purchaser',
    finance_bank_name: text(input.finance_bank_name),
    finance_bank_branch: text(input.finance_bank_branch),
    ...('finance_bank_address' in input ? { finance_bank_address: text(input.finance_bank_address) } : {}),
    finance_loan_status: text(input.finance_loan_status),
    finance_sanction_ref: text(input.finance_sanction_ref),
    finance_sanction_amount: toHundredths(input.finance_sanction_amount) == null
      ? null
      : hundredthsToString(toHundredths(input.finance_sanction_amount) as bigint),
    finance_sanction_date: text(input.finance_sanction_date),
    booking_amount_paid: hundredthsToString(paid),
    gst_amount: hundredthsToString(gst),
    gst_collected: hundredthsToString(collected),
    noc_required: nocRequired,
    noc_bank_name: nocRequired ? text(input.noc_bank_name) : null,
    noc_addressee: nocRequired ? text(input.noc_addressee) : null,
    noc_bank_address_line1: nocRequired ? text(bankAddress.address_line1) : null,
    noc_bank_address_line2: nocRequired ? text(bankAddress.address_line2) : null,
    noc_bank_city: nocRequired ? text(bankAddress.city) : null,
    noc_bank_state: nocRequired ? text(bankAddress.state) : null,
    noc_bank_pin_code: nocRequired ? text(bankAddress.pin_code) : null,
    noc_bank_country: nocRequired ? text(bankAddress.country) || 'India' : null,
    noc_bank_address: nocRequired
      ? formatPostalAddress({ ...bankAddress, country: text(bankAddress.country) || 'India' }) || text(input.noc_bank_address)
      : null,
    payment_plan_type: scheduleMode === 'custom' ? 'Custom' : 'ConstructionLinked',
  }
  if ('allotment_date' in input) patch.allotment_date = text(input.allotment_date) || null
  if ('agreement_for_sale_date' in input) patch.agreement_for_sale_date = text(input.agreement_for_sale_date) || null

  if (Array.isArray(input.coapplicants)) {
    const first = coapplicants[0]
    patch.coapplicant_name = text(first?.name)
    patch.coapplicant_relationship = text(first?.father_or_spouse)
    patch.coapplicant_mobile = text(first?.mobile)
    patch.coapplicant_pan = text(first?.pan)
    patch.coapplicant_aadhaar = text(first?.aadhaar)
  }

  if (input.pricing_mode === 'lump_sum') patch.rate_per_sqft = null
  if (base != null) {
    const baseString = hundredthsToString(base)
    patch.basic_sale_price = baseString
    patch.total_cost = baseString
    if (input.pricing_mode !== 'lump_sum') {
      patch.rate_per_sqft = hundredthsToString(toHundredths(input.rate_per_sqft) as bigint)
    }
    if (mode === 'submit' || Array.isArray(input.parking_spaces)) {
      patch.total_parking_charges = hundredthsToString(parkingTotal)
      patch.total_property_value = hundredthsToString(base + parkingTotal)
    }
  }

  if (mode === 'submit' || Array.isArray(input.parking_spaces)) {
    patch.additional_parking = mainCount
    patch.premium_parking = secondaryCount
  }

  return patch
}

export async function replaceBookingChildren(
  supabase: SupabaseClient,
  bookingId: string,
  input: Record<string, unknown>,
  mode: 'draft' | 'submit'
) {
  const priced = considerationOf(input)
  const scheduleMode = input.schedule_mode === 'custom' ? 'custom' : 'standard'

  if (Array.isArray(input.coapplicants)) {
    const people = input.coapplicants as CoApplicantInput[]
    const ids = people.map((person) => person.id).filter((id) => UUID_RE.test(id))
    const remove = supabase.from('booking_coapplicants').delete().eq('booking_id', bookingId)
    const { error: deleteError } = ids.length
      ? await remove.not('id', 'in', `(${ids.map((id) => `"${id}"`).join(',')})`)
      : await remove
    if (deleteError) throw new Error(`Failed to update co-applicants: ${deleteError.message}`)
    if (people.length) {
      const rows = people.map((person, index) => {
        const country = text(person.country) || 'India'
        const address = formatPostalAddress({ ...person, country })
        return {
          id: person.id,
          booking_id: bookingId,
          sort_order: index,
          name: text(person.name),
          salutation: text(person.salutation),
          father_or_spouse: text(person.father_or_spouse),
          relationship: text(person.relationship),
          occupation: text(person.occupation),
          mobile: text(person.mobile),
          email: text(person.email),
          pan: text(person.pan),
          aadhaar: text(person.aadhaar),
          address_line1: text(person.address_line1),
          address_line2: text(person.address_line2),
          city: text(person.city),
          state: text(person.state),
          pin_code: text(person.pin_code),
          country,
          address,
        }
      })
      const { error } = await supabase.from('booking_coapplicants').upsert(rows)
      if (error) throw new Error(`Failed to save co-applicants: ${error.message}`)
    }
  }

  if (Array.isArray(input.parking_spaces)) {
    const spaces = input.parking_spaces as ParkingSpaceInput[]
    await supabase.from('booking_parking_spaces').delete().eq('booking_id', bookingId)
    if (spaces.length) {
      const rows = spaces.map((space, index) => ({
        id: space.id,
        booking_id: bookingId,
        sort_order: index,
        kind: space.kind,
        quantity: Math.max(1, Math.floor(Number(space.quantity ?? 1)) || 1),
        label: text(space.label),
        price: hundredthsToString(toHundredths(space.price) ?? 0n),
      }))
      const { error } = await supabase.from('booking_parking_spaces').insert(rows)
      if (error) throw new Error(`Failed to save parking: ${error.message}`)
    }
  }

  if (Array.isArray(input.payment_entries)) {
    const entries = input.payment_entries as PaymentEntryInput[]
    const { error: deleteError } = await supabase.from('booking_payment_entries').delete().eq('booking_id', bookingId)
    if (deleteError) throw new Error(`Failed to update payments: ${deleteError.message}. Run supabase/migrations/009_agreement_finance.sql.`)
    if (entries.length) {
      const rows = entries.map((entry, index) => ({
        id: entry.id,
        booking_id: bookingId,
        sort_order: index,
        payer_kind: entry.payer_kind,
        payer_coapplicant_id: UUID_RE.test(text(entry.payer_coapplicant_id) || '') ? text(entry.payer_coapplicant_id) : null,
        payer_name: text(entry.payer_name),
        amount: hundredthsToString(toHundredths(entry.amount) ?? 0n),
        payment_mode: text(entry.payment_mode),
        payment_mode_detail: text(entry.payment_mode_detail),
        reference_no: text(entry.reference_no),
        payment_date: text(entry.payment_date),
        originating_bank: text(entry.originating_bank),
        status: normalizeEntryStatus(entry.status),
        gst_amount: hundredthsToString(toHundredths(entry.gst_amount) ?? 0n),
        notes: text(entry.notes),
      }))
      let { error } = await supabase.from('booking_payment_entries').insert(rows)
      if (error && /gst_amount|notes|schema cache/i.test(error.message)) {
        const legacy = rows.map(({ gst_amount: _gst, notes: _notes, ...row }) => row)
        if (legacy.some((row) => row.status !== 'received' && row.status !== 'expected')) {
          throw new Error('Pending, cleared and returned payments need supabase/migrations/010_payment_ledger.sql. Run it in the Supabase SQL editor, or mark the payment Received.')
        }
        error = (await supabase.from('booking_payment_entries').insert(legacy)).error
      }
      if (error && /status_check/i.test(error.message)) {
        throw new Error('Pending, cleared and returned payments need supabase/migrations/010_payment_ledger.sql. Run it in the Supabase SQL editor, or mark the payment Received.')
      }
      if (error) throw new Error(`Failed to save payments: ${error.message}`)
    }
  }

  if (mode === 'submit' || Array.isArray(input.schedule_rows) || input.schedule_mode) {
    const rows: ScheduleRowInput[] =
      scheduleMode === 'standard' ? standardScheduleRows() : ((input.schedule_rows as ScheduleRowInput[]) || [])
    if (priced != null && rows.length) {
      const frozen = await frozenFinancials(supabase, bookingId)
      const resolved = resolveSchedule(priced.totalPaise, rows)
      if (frozen.frozen || !resolved.balanced) return
      const projectName = text(input.project_name) || 'Anandam'
      const { data: milestones, error: milestoneError } = await supabase
        .from('construction_milestones')
        .select('id, code')
        .eq('project_name', projectName)
      if (milestoneError && !/construction_milestones|schema cache/i.test(milestoneError.message)) {
        throw new Error(`Failed to load construction milestones: ${milestoneError.message}`)
      }
      const milestoneId = new Map((milestones || []).map((item) => [item.code as string, item.id as string]))
      await supabase.from('booking_schedule_rows').delete().eq('booking_id', bookingId)
      if (resolved.rows.length) {
        const scheduleRows = resolved.rows.map((row, index) => ({
          booking_id: bookingId,
          sort_order: index,
          trigger_type: row.trigger_type,
          label: row.label,
          milestone_id: row.milestone_code ? milestoneId.get(row.milestone_code) ?? null : null,
          milestone_date: row.milestone_date,
          calc_type: row.calc_type,
          value: row.value,
          calculated_amount: row.calculated_amount,
        }))
        let { error } = await supabase.from('booking_schedule_rows').insert(scheduleRows)
        if (error && /milestone_id|schema cache/i.test(error.message)) {
          const withoutMilestone = scheduleRows.map(({ milestone_id: _milestoneId, ...row }) => row)
          const retry = await supabase.from('booking_schedule_rows').insert(withoutMilestone)
          error = retry.error
        }
        if (error) throw new Error(`Failed to save the payment schedule: ${error.message}`)
      }
      if (scheduleMode === 'standard') {
        await syncStandardSlabDues(supabase, bookingId, resolved.rows.map((row) => row.calculated_amount))
      }
    }
  }
}

export async function frozenFinancials(
  supabase: SupabaseClient,
  bookingId: string
): Promise<{ frozen: boolean; reason: string | null }> {
  const [docs, notes, receipts, paidSlabs] = await Promise.all([
    supabase.from('booking_generated_documents').select('id').eq('booking_id', bookingId).eq('kind', 'agreement').eq('finalized', true).limit(1),
    supabase.from('demand_notes').select('id').eq('booking_id', bookingId).limit(1),
    supabase.from('payment_receipts').select('id').eq('booking_id', bookingId).limit(1),
    supabase.from('booking_payment_slabs').select('id').eq('booking_id', bookingId).gt('amount_received', 0).limit(1),
  ])
  if (docs.data?.length) return { frozen: true, reason: 'A finalized Agreement for Sale is on file.' }
  if (notes.data?.length) return { frozen: true, reason: 'Demand notes have already been issued.' }
  if (receipts.data?.length) return { frozen: true, reason: 'A payment receipt is already recorded.' }
  if (paidSlabs.data?.length) return { frozen: true, reason: 'A schedule installment already has money recorded against it.' }
  return { frozen: false, reason: null }
}

/** Keep the accounts slab rows aligned with Total Consideration, without marking anything received. */
async function syncStandardSlabDues(
  supabase: SupabaseClient,
  bookingId: string,
  amounts: string[]
) {
  const { data: slabs } = await supabase.from('payment_slabs').select('id, sr_no').order('sr_no')
  if (!slabs?.length) return
  for (const slab of slabs) {
    const amount = amounts[(slab.sr_no as number) - 1]
    if (amount == null) continue
    const { data: existing } = await supabase
      .from('booking_payment_slabs')
      .select('id, amount_received')
      .eq('booking_id', bookingId)
      .eq('slab_id', slab.id)
      .maybeSingle()
    if (existing) {
      await supabase.from('booking_payment_slabs').update({ amount_due: amount }).eq('id', existing.id)
    } else {
      await supabase.from('booking_payment_slabs').insert({
        booking_id: bookingId,
        slab_id: slab.id,
        amount_due: amount,
        amount_received: 0,
      })
    }
  }
}

export async function loadExtrasForBookings(supabase: SupabaseClient, bookingIds: string[]) {
  const empty = () => ({ coapplicants: [] as Record<string, unknown>[], parking_spaces: [] as Record<string, unknown>[], schedule_rows: [] as Record<string, unknown>[] })
  const grouped = new Map<string, ReturnType<typeof empty>>()
  if (!bookingIds.length) return grouped
  const [coapplicants, parking, schedule] = await Promise.all([
    supabase.from('booking_coapplicants').select('*').in('booking_id', bookingIds).order('sort_order'),
    supabase.from('booking_parking_spaces').select('*').in('booking_id', bookingIds).order('sort_order'),
    supabase.from('booking_schedule_rows').select('*').in('booking_id', bookingIds).order('sort_order'),
  ])
  for (const id of bookingIds) grouped.set(id, empty())
  for (const row of coapplicants.data || []) grouped.get(row.booking_id)?.coapplicants.push(row)
  for (const row of parking.data || []) grouped.get(row.booking_id)?.parking_spaces.push(row)
  for (const row of schedule.data || []) grouped.get(row.booking_id)?.schedule_rows.push(row)
  return grouped
}

export async function loadBookingExtras(supabase: SupabaseClient, bookingId: string) {
  const [coapplicants, parking, schedule, payments] = await Promise.all([
    supabase.from('booking_coapplicants').select('*').eq('booking_id', bookingId).order('sort_order'),
    supabase.from('booking_parking_spaces').select('*').eq('booking_id', bookingId).order('sort_order'),
    supabase.from('booking_schedule_rows').select('*').eq('booking_id', bookingId).order('sort_order'),
    supabase.from('booking_payment_entries').select('*').eq('booking_id', bookingId).order('sort_order'),
  ])
  return {
    coapplicants: coapplicants.data || [],
    parking_spaces: parking.data || [],
    payment_entries: payments.error ? [] : payments.data || [],
    schedule_rows: schedule.data || [],
    schedule_mode: (schedule.data || []).some((row) => row.calc_type === 'fixed' || row.trigger_type === 'date')
      ? 'custom'
      : 'standard',
  }
}
