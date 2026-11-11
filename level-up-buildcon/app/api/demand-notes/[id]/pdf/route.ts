import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { assertCanDownloadPdfs } from '@/lib/auth/permissions'
import { jsonAuthError } from '@/lib/api/auth-response'
import { demandBlocks, snapshotFromStorage, type DemandSnapshot } from '@/lib/documents/demand-model'
import { renderLetterPdf } from '@/lib/documents/letter-pdf'
import { paiseFrom, subtractSplit, todayInTimeZone } from '@/lib/demands/engine'
import { loadDemandRules } from '@/lib/demands/issue'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const profile = await requireStaff()
    const supabase = await createClient()
    const { data: note, error } = await supabase.from('demand_notes').select('*').eq('id', id).single()
    if (error || !note) return NextResponse.json({ error: 'Demand note not found' }, { status: 404 })

    const { data: booking } = await supabase.from('bookings').select('id, status, created_by, deleted_at').eq('id', note.booking_id).single()
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    assertCanDownloadPdfs(profile, booking)

    const stored = snapshotFromStorage(note.snapshot as Record<string, unknown>)
    const statement = request.nextUrl.searchParams.get('statement') === '1'
    let snapshot: DemandSnapshot = stored
    let statementDate: string | undefined
    if (statement) {
      const rules = await loadDemandRules(supabase)
      statementDate = todayInTimeZone(new Date(), rules.timezone)
      const { data: allocations } = await supabase
        .from('installment_allocations')
        .select('principal_amount, gst_amount')
        .eq('schedule_row_id', note.schedule_row_id)
      const received = (allocations || []).reduce(
        (sum, item) => ({
          principal: sum.principal + paiseFrom(item.principal_amount),
          gst: sum.gst + paiseFrom(item.gst_amount),
        }),
        { principal: 0n, gst: 0n }
      )
      const outstanding = subtractSplit(
        { principal: stored.installmentPaise, gst: stored.gstPaise },
        received
      )
      snapshot = {
        ...stored,
        principalReceivedPaise: received.principal,
        gstReceivedPaise: received.gst,
        principalOutstandingPaise: outstanding.principal,
        gstOutstandingPaise: outstanding.gst,
      }
    }

    const pdf = await renderLetterPdf(demandBlocks(snapshot, { statement, statementDate }))
    const filename = statement
      ? `${note.reference_number.replace(/[^\w.-]+/g, '_')}_statement.pdf`
      : `${note.reference_number.replace(/[^\w.-]+/g, '_')}.pdf`
    const download = request.nextUrl.searchParams.get('download') === '1'
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const authResp = jsonAuthError(error)
    if (authResp) return authResp
    console.error('[demand-pdf] generation failed')
    return NextResponse.json({ error: 'Failed to generate the demand note' }, { status: 500 })
  }
}
