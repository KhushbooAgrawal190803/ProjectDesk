import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest) {
  try {
    // Must be an authenticated "kill user"
    const supabaseAuth = await createClient()
    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser()

    if (userError || !user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const allowListRaw =
      process.env.DESTRUCT_USER_EMAILS ||
      // Fallback: allow the configured kill user email if explicit allowlist isn't set.
      // (Still requires an authenticated Supabase user with that email.)
      process.env.NEXT_PUBLIC_DESTRUCT_EMAIL ||
      ''
    const allowList = allowListRaw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)

    if (allowList.length === 0) {
      return NextResponse.json(
        { error: 'Destruct is not configured (missing DESTRUCT_USER_EMAILS)' },
        { status: 500 }
      )
    }

    if (!allowList.includes(user.email.toLowerCase())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const supabase = await createServiceClient()

    // Delete all bookings (cascades to related tables via FK ON DELETE CASCADE)
    const { error: bookingsError } = await supabase
      .from('bookings')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (bookingsError) {
      console.error('Destruct bookings error:', bookingsError.message)
      return NextResponse.json({ error: `Failed to delete bookings: ${bookingsError.message}` }, { status: 500 })
    }

    // Also clear admin audit log
    const { error: auditError } = await supabase
      .from('admin_audit_log')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (auditError) {
      console.error('Destruct admin audit error:', auditError.message)
      return NextResponse.json({ error: `Failed to delete admin audit log: ${auditError.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Destruct API error:', err)
    return NextResponse.json({ error: 'Destruct API failed' }, { status: 500 })
  }
}

