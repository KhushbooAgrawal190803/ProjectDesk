import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { jsonAuthError } from '@/lib/api/auth-response'
import { OWNER_NAMES } from '@/lib/data/flat-ownership'
import { formatLetterDate } from '@/lib/documents/inr-words'
import { loadStatements, statementParams } from '@/lib/ledger/statement-load'
import { buildStatementXlsx } from '@/lib/ledger/statement-xlsx'
import { buildStatementPdf } from '@/lib/ledger/statement-pdf'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** The cash statement as an Excel or PDF download: ?from=YYYY-MM-DD&to=YYYY-MM-DD&owner=levelup|balaji&format=xlsx|pdf */
export async function GET(request: NextRequest) {
  try {
    await requireStaff()
    const search = request.nextUrl.searchParams
    const { from, to, owner } = statementParams({ from: search.get('from'), to: search.get('to'), owner: search.get('owner') })
    const format = search.get('format') === 'pdf' ? 'pdf' : 'xlsx'
    const supabase = await createClient()
    const statement = (await loadStatements(supabase, { from, to }))[owner]
    const meta = { company: OWNER_NAMES[owner], period: `${formatLetterDate(from)} to ${formatLetterDate(to)}` }
    const name = `${OWNER_NAMES[owner].replace(/\s+/g, '-')}-Cash-Statement-${from}-to-${to}`
    const body = format === 'pdf' ? buildStatementPdf(statement, meta) : buildStatementXlsx(statement, meta)
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${name}.${format}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const auth = jsonAuthError(error)
    if (auth) return auth
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The statement could not be prepared.' }, { status: 500 })
  }
}
