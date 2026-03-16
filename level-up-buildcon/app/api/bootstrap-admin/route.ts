import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createServiceClient()

    const email = 'KHUSHBOO190803@internal.local'
    const password = 'Passw0rd'

    // Try to create first; if email already exists, find and update instead
    let user: any = null

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (createError) {
      if (createError.message?.includes('already been registered') || createError.message?.includes('already exists')) {
        // User exists — find them via paginated list (case-insensitive match)
        let found: any = null
        let page = 1
        while (!found) {
          const { data: listing } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
          if (!listing?.users?.length) break
          found = listing.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null
          if (found || listing.users.length < 1000) break
          page++
        }
        if (!found) {
          return NextResponse.json({ error: 'User exists but could not be located.' }, { status: 500 })
        }
        user = found
        // Reset password to the known value
        await supabase.auth.admin.updateUserById(user.id, { password })
      } else {
        return NextResponse.json({ error: createError.message }, { status: 500 })
      }
    } else {
      if (!created.user) {
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
      }
      user = created.user
    }

    // Upsert profile using service role (bypasses RLS)
    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        full_name: 'KHUSHBOOAGRAWAL190803',
        email: email,
        role: 'ADMIN',
        status: 'ACTIVE',
      }, { onConflict: 'id' })

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      login_email: email,
      password,
      user_id: user.id,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}
