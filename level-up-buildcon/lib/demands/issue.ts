import type { SupabaseClient } from '@supabase/supabase-js'
import { getOwnerTypeForFlat, type OwnerType } from '@/lib/data/flat-ownership'
import { createServiceClient } from '@/lib/supabase/server'
import { considerationOf } from '@/lib/booking/consideration'
import { hundredthsToString } from '@/lib/booking/money'
import { formatPersonName } from '@/lib/booking/person'
import { snapshotForStorage, type DemandSnapshot } from '@/lib/documents/demand-model'
import { receivingAccountFor } from '@/lib/documents/receiving-accounts'
import {
  ACTIVE_BOOKING_STATUSES,
  DEFAULT_GST_PERCENT,
  DEFAULT_NUMBER_TEMPLATE,
  DEFAULT_PAYMENT_DAYS,
  DEMAND_TIMEZONE,
  addCalendarDays,
  collectionStatus,
  displayStatus,
  formatDemandNumber,
  installmentGstPaise,
  isInstallmentDue,
  isOverdue,
  paiseFrom,
  planDemandIssues,
  sequenceScope,
  subtractSplit,
  todayInTimeZone,
  type InstallmentCandidate,
  type MoneySplit,
} from '@/lib/demands/engine'

type Row = Record<string, unknown>

export interface DemandRules {
  timezone: string
  paymentDays: number
  template: string
  gstPercent: number
}

export async function loadDemandRules(supabase: SupabaseClient): Promise<DemandRules> {
  const { data, error } = await supabase
    .from('settings')
    .select('demand_timezone, demand_payment_days, demand_number_template, demand_gst_percent')
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Demand note settings are not available. Run the demand-note migration. ${error.message}`)
  return {
    timezone: data?.demand_timezone || DEMAND_TIMEZONE,
    paymentDays: Number(data?.demand_payment_days || DEFAULT_PAYMENT_DAYS),
    template: data?.demand_number_template || DEFAULT_NUMBER_TEMPLATE,
    gstPercent: Number(data?.demand_gst_percent || DEFAULT_GST_PERCENT),
  }
}

function propertyValuePaise(booking: Row): bigint | null {
  return considerationOf(booking)?.totalPaise ?? null
}

function applicantLines(booking: Row, people: Row[]): string[] {
  const names = [
    formatPersonName(booking.applicant_salutation as string, booking.applicant_name as string),
    ...people.map((person) => formatPersonName(person.salutation as string, person.name as string)),
  ].filter(Boolean)
  const lines = [names.join(' & ')]
  const careOf = String(booking.applicant_father_or_spouse || '').trim()
  if (careOf) lines.push(`C/o ${careOf}`)
  String(booking.applicant_address || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => lines.push(line))
  return lines
}

function blockersFor(booking: Row, owner: OwnerType | null, property: bigint | null): string[] {
  const blockers: string[] = []
  if (!booking.unit_no) blockers.push('Unit number is missing.')
  if (!owner) blockers.push('This unit is not on the developer or landowner allocation list.')
  if (!String(booking.applicant_name || '').trim()) blockers.push('Applicant name is missing.')
  if (!booking.agreement_for_sale_date) blockers.push('Agreement for Sale date has not been recorded.')
  if (property == null || property <= 0n) blockers.push('Combined property price is missing.')
  return blockers
}

async function ensureBookingAdvance(supabase: SupabaseClient, booking: Row, actorId?: string | null) {
  const principal = paiseFrom(booking.booking_amount_paid)
  const gst = paiseFrom(booking.gst_collected)
  if (principal <= 0n && gst <= 0n) return
  const { data: existing } = await supabase
    .from('payment_receipts')
    .select('id')
    .eq('booking_id', booking.id)
    .eq('source', 'booking_advance')
    .maybeSingle()
  if (existing) return
  const rawDate = String(booking.txn_date || booking.submitted_at || new Date().toISOString())
  const { error } = await supabase.from('payment_receipts').insert({
    booking_id: booking.id,
    source: 'booking_advance',
    principal_amount: hundredthsToString(principal),
    gst_amount: hundredthsToString(gst),
    payment_date: rawDate.slice(0, 10),
    payment_mode: booking.payment_mode || null,
    reference_no: booking.txn_or_cheque_no || null,
    remarks: 'Booking amount recorded on the booking form. It is not applied to an installment until someone allocates it.',
    recorded_by: actorId || null,
  })
  if (error && error.code !== '23505') throw new Error(error.message)
}

export interface InstallmentState {
  id: string
  sort: number
  trigger: 'milestone' | 'date'
  label: string
  due: boolean
  status: string
  overdue: boolean
  principalPaise: bigint
  gstPaise: bigint
  receivedPaise: bigint
  gstReceivedPaise: bigint
  outstandingPrincipalPaise: bigint
  outstandingGstPaise: bigint
  demandId: string | null
  referenceNumber: string | null
  deadline: string | null
  issueDate: string | null
}

export interface BookingDemandState {
  today: string
  finalized: boolean
  blockers: string[]
  installments: InstallmentState[]
  advancePrincipalPaise: bigint
  advanceGstPaise: bigint
  unallocatedPrincipalPaise: bigint
  unallocatedGstPaise: bigint
  advanceReceiptId: string | null
}

export async function getBookingDemandState(supabase: SupabaseClient, bookingId: string, today?: string): Promise<BookingDemandState> {
  const rules = await loadDemandRules(supabase)
  const localToday = today || todayInTimeZone(new Date(), rules.timezone)
  const { data: booking, error } = await supabase.from('bookings').select('*').eq('id', bookingId).single()
  if (error || !booking) throw new Error('Booking not found')
  if ((ACTIVE_BOOKING_STATUSES as readonly string[]).includes(booking.status) && !booking.deleted_at) {
    await ensureBookingAdvance(supabase, booking, null)
  }

  const [schedule, milestones, demands, receipts] = await Promise.all([
    supabase.from('booking_schedule_rows').select('*').eq('booking_id', bookingId).order('sort_order'),
    supabase.from('construction_milestones').select('id, label, completed_at').eq('project_name', booking.project_name || 'Anandam'),
    supabase.from('demand_notes').select('id, schedule_row_id, reference_number, payment_deadline, issue_date').eq('booking_id', bookingId),
    supabase.from('payment_receipts').select('id, source, principal_amount, gst_amount').eq('booking_id', bookingId),
  ])
  for (const result of [schedule, milestones, demands, receipts]) {
    if (result.error) throw new Error(result.error.message)
  }

  const rowIds = (schedule.data || []).map((row) => row.id as string)
  const { data: allocations, error: allocationError } = rowIds.length
    ? await supabase.from('installment_allocations').select('schedule_row_id, receipt_id, principal_amount, gst_amount').in('schedule_row_id', rowIds)
    : { data: [], error: null }
  if (allocationError) throw new Error(allocationError.message)

  const completed = new Map((milestones.data || []).map((item) => [item.id as string, Boolean(item.completed_at)]))
  const labels = new Map((milestones.data || []).map((item) => [item.id as string, item.label as string]))
  const demandByRow = new Map((demands.data || []).map((item) => [item.schedule_row_id as string, item]))
  const allocated = new Map<string, MoneySplit>()
  for (const item of allocations || []) {
    const current = allocated.get(item.schedule_row_id) || { principal: 0n, gst: 0n }
    current.principal += paiseFrom(item.principal_amount)
    current.gst += paiseFrom(item.gst_amount)
    allocated.set(item.schedule_row_id, current)
  }

  const advance = (receipts.data || []).find((item) => item.source === 'booking_advance')
  let advanceAllocated = { principal: 0n, gst: 0n }
  if (advance) {
    for (const item of allocations || []) {
      if (item.receipt_id !== advance.id) continue
      advanceAllocated = {
        principal: advanceAllocated.principal + paiseFrom(item.principal_amount),
        gst: advanceAllocated.gst + paiseFrom(item.gst_amount),
      }
    }
  }
  const advancePrincipal = advance ? paiseFrom(advance.principal_amount) : 0n
  const advanceGst = advance ? paiseFrom(advance.gst_amount) : 0n
  const owner = getOwnerTypeForFlat(booking.unit_no)
  const property = propertyValuePaise(booking)
  const finalized = (ACTIVE_BOOKING_STATUSES as readonly string[]).includes(booking.status) && !booking.deleted_at
  const blockers = finalized ? blockersFor(booking, owner, property) : ['This booking is not finalized.']

  const installments: InstallmentState[] = (schedule.data || []).map((row) => {
    const principal = paiseFrom(row.calculated_amount)
    const gst = installmentGstPaise(principal, rules.gstPercent)
    const received = allocated.get(row.id) || { principal: 0n, gst: 0n }
    const outstanding = subtractSplit({ principal, gst }, received)
    const demand = demandByRow.get(row.id)
    const due = isInstallmentDue({
      trigger: row.trigger_type,
      milestoneCompleted: row.milestone_id ? completed.get(row.milestone_id) === true : false,
      dueDate: row.milestone_date,
      today: localToday,
    })
    const overdue = isOverdue({
      demanded: Boolean(demand),
      outstanding,
      deadline: demand?.payment_deadline || null,
      today: localToday,
    })
    const status = collectionStatus({ due, demanded: Boolean(demand), outstanding, received })
    const label = row.trigger_type === 'date'
      ? String(row.milestone_date || row.label || 'Dated installment')
      : labels.get(row.milestone_id) || String(row.label || 'Milestone')
    return {
      id: row.id,
      sort: row.sort_order,
      trigger: row.trigger_type,
      label,
      due,
      status: displayStatus(status, overdue),
      overdue,
      principalPaise: principal,
      gstPaise: gst,
      receivedPaise: received.principal,
      gstReceivedPaise: received.gst,
      outstandingPrincipalPaise: outstanding.principal,
      outstandingGstPaise: outstanding.gst,
      demandId: demand?.id || null,
      referenceNumber: demand?.reference_number || null,
      deadline: demand?.payment_deadline || null,
      issueDate: demand?.issue_date || null,
    }
  })

  return {
    today: localToday,
    finalized,
    blockers,
    installments,
    advancePrincipalPaise: advancePrincipal,
    advanceGstPaise: advanceGst,
    unallocatedPrincipalPaise: advancePrincipal > advanceAllocated.principal ? advancePrincipal - advanceAllocated.principal : 0n,
    unallocatedGstPaise: advanceGst > advanceAllocated.gst ? advanceGst - advanceAllocated.gst : 0n,
    advanceReceiptId: advance?.id || null,
  }
}

async function nextSequenceFromTable(supabase: SupabaseClient, scope: string): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: row, error: readError } = await supabase
      .from('demand_note_counters')
      .select('last_seq')
      .eq('scope_key', scope)
      .maybeSingle()
    if (readError) throw new Error(readError.message)
    const next = Number(row?.last_seq || 0) + 1
    if (!row) {
      const { error: insertError } = await supabase.from('demand_note_counters').insert({ scope_key: scope, last_seq: next })
      if (!insertError) return next
      if (insertError.code !== '23505') throw new Error(insertError.message)
      continue
    }
    const { data: updated, error: updateError } = await supabase
      .from('demand_note_counters')
      .update({ last_seq: next })
      .eq('scope_key', scope)
      .eq('last_seq', row.last_seq)
      .select('last_seq')
    if (updateError) throw new Error(updateError.message)
    if (updated && updated.length) return next
  }
  throw new Error('Could not take the next demand note number')
}

async function takeDemandSequence(supabase: SupabaseClient, scope: string): Promise<number> {
  const { data, error } = await supabase.rpc('next_demand_sequence', { scope_key: scope })
  if (!error) return Number(data)
  // The live function still names its argument scope_key, so Postgres rejects it.
  // The counter table is locked to the service role, so a signed-in user cannot write it directly.
  if (!/ambiguous|permission denied/i.test(error.message || '')) throw new Error(error.message)
  try {
    return await nextSequenceFromTable(supabase, scope)
  } catch (tableError) {
    const message = tableError instanceof Error ? tableError.message : String(tableError)
    if (!/permission denied/i.test(message)) throw tableError
    return nextSequenceFromTable(await createServiceClient(), scope)
  }
}

export async function reconcileBooking(
  supabase: SupabaseClient,
  bookingId: string,
  options?: { today?: string; actorId?: string | null }
): Promise<{ issued: string[]; blockers: string[] }> {
  const rules = await loadDemandRules(supabase)
  const today = options?.today || todayInTimeZone(new Date(), rules.timezone)
  const { data: booking, error } = await supabase.from('bookings').select('*').eq('id', bookingId).single()
  if (error || !booking) throw new Error('Booking not found')
  if (!(ACTIVE_BOOKING_STATUSES as readonly string[]).includes(booking.status) || booking.deleted_at) {
    return { issued: [], blockers: ['This booking is not finalized.'] }
  }

  await ensureBookingAdvance(supabase, booking, options?.actorId)

  const [schedule, milestones, demands, people] = await Promise.all([
    supabase.from('booking_schedule_rows').select('*').eq('booking_id', bookingId).order('sort_order'),
    supabase.from('construction_milestones').select('id, code, label, completed_at').eq('project_name', booking.project_name || 'Anandam'),
    supabase.from('demand_notes').select('schedule_row_id').eq('booking_id', bookingId),
    supabase.from('booking_coapplicants').select('salutation, name').eq('booking_id', bookingId).order('sort_order'),
  ])
  for (const result of [schedule, milestones, demands, people]) {
    if (result.error) throw new Error(result.error.message)
  }
  const rows = schedule.data || []
  const rowIds = rows.map((row) => row.id as string)
  const { data: allocations, error: allocationError } = rowIds.length
    ? await supabase.from('installment_allocations').select('schedule_row_id, principal_amount, gst_amount').in('schedule_row_id', rowIds)
    : { data: [], error: null }
  if (allocationError) throw new Error(allocationError.message)

  const owner = getOwnerTypeForFlat(booking.unit_no)
  const property = propertyValuePaise(booking)
  const blockers = blockersFor(booking, owner, property)
  if (blockers.length || !owner || property == null) return { issued: [], blockers }

  const completed = new Map((milestones.data || []).map((item) => [item.id as string, Boolean(item.completed_at)]))
  const labels = new Map((milestones.data || []).map((item) => [item.id as string, item.label as string]))
  const issuedRows = new Set((demands.data || []).map((item) => item.schedule_row_id as string))
  const allocated = new Map<string, MoneySplit>()
  for (const item of allocations || []) {
    const current = allocated.get(item.schedule_row_id) || { principal: 0n, gst: 0n }
    current.principal += paiseFrom(item.principal_amount)
    current.gst += paiseFrom(item.gst_amount)
    allocated.set(item.schedule_row_id, current)
  }

  const candidates: InstallmentCandidate[] = rows.map((row) => {
    const principal = paiseFrom(row.calculated_amount)
    const received = allocated.get(row.id) || { principal: 0n, gst: 0n }
    return {
      id: row.id,
      trigger: row.trigger_type,
      linked: row.trigger_type === 'date' ? Boolean(row.milestone_date) : Boolean(row.milestone_id),
      milestoneCompleted: row.milestone_id ? completed.get(row.milestone_id) === true : false,
      dueDate: row.milestone_date,
      principalPaise: principal,
      gstPaise: installmentGstPaise(principal, rules.gstPercent),
      allocatedPrincipalPaise: received.principal,
      allocatedGstPaise: received.gst,
      hasDemand: issuedRows.has(row.id),
    }
  })
  const plan = planDemandIssues(candidates, today)
  const year = Number(today.slice(0, 4))
  const scope = sequenceScope(String(booking.project_name || ''), String(booking.unit_no || ''), year)
  const issued: string[] = []

  for (const item of plan.issue) {
    const row = rows.find((candidate) => candidate.id === item.id)
    const candidate = candidates.find((entry) => entry.id === item.id)
    if (!row || !candidate) continue
    const seq = await takeDemandSequence(supabase, scope)
    const referenceNumber = formatDemandNumber(rules.template, {
      project: String(booking.project_name || ''),
      unit: String(booking.unit_no || ''),
      seq: seq,
      year,
    })
    const snapshot: DemandSnapshot = {
      referenceNumber,
      issueDate: today,
      paymentDeadline: addCalendarDays(today, rules.paymentDays),
      paymentDays: rules.paymentDays,
      agreementDate: String(booking.agreement_for_sale_date).slice(0, 10),
      owner,
      unitNo: String(booking.unit_no),
      projectName: String(booking.project_name || 'Anandam'),
      applicantLines: applicantLines(booking, people.data || []),
      milestoneLabel: row.trigger_type === 'date'
        ? String(row.label || row.milestone_date)
        : labels.get(row.milestone_id) || String(row.label || 'Installment'),
      account: receivingAccountFor(owner),
      propertyValuePaise: property,
      installmentPaise: candidate.principalPaise,
      gstPaise: candidate.gstPaise,
      principalReceivedPaise: candidate.allocatedPrincipalPaise,
      gstReceivedPaise: candidate.allocatedGstPaise,
      principalOutstandingPaise: item.outstanding.principal,
      gstOutstandingPaise: item.outstanding.gst,
    }
    const { error: insertError } = await supabase.from('demand_notes').insert({
      booking_id: booking.id,
      schedule_row_id: row.id,
      reference_number: referenceNumber,
      sequence_no: seq,
      issue_date: snapshot.issueDate,
      payment_deadline: snapshot.paymentDeadline,
      project_name: snapshot.projectName,
      unit_no: snapshot.unitNo,
      applicant_name: formatPersonName(booking.applicant_salutation as string, booking.applicant_name as string),
      owner_type: owner,
      trigger_label: snapshot.milestoneLabel,
      milestone_id: row.milestone_id,
      installment_amount: hundredthsToString(snapshot.installmentPaise),
      gst_amount: hundredthsToString(snapshot.gstPaise),
      principal_received_at_issue: hundredthsToString(snapshot.principalReceivedPaise),
      gst_received_at_issue: hundredthsToString(snapshot.gstReceivedPaise),
      snapshot: snapshotForStorage(snapshot),
      created_by: options?.actorId || null,
    })
    if (insertError) {
      if (insertError.code === '23505') continue
      throw new Error(insertError.message)
    }
    issued.push(referenceNumber)
    if (options?.actorId) {
      await supabase.from('booking_audit_log').insert({
        booking_id: booking.id,
        changed_by: options.actorId,
        action: 'DEMAND_ISSUED',
        reason: `Demand note ${referenceNumber} issued`,
      })
    }
  }

  return { issued, blockers: [] }
}

export async function reconcileActiveBookings(supabase: SupabaseClient, today?: string) {
  const { data, error } = await supabase
    .from('bookings')
    .select('id')
    .in('status', [...ACTIVE_BOOKING_STATUSES])
    .is('deleted_at', null)
  if (error) throw new Error(error.message)
  const issued: string[] = []
  for (const booking of data || []) {
    const result = await reconcileBooking(supabase, booking.id, { today })
    issued.push(...result.issued)
  }
  return issued
}
