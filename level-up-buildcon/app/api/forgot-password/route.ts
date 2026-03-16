import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const supabase = await createServiceClient()

    // Verify the user exists
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('email', email)
      .single()

    if (!profile) {
      // Don't reveal if user exists — just show success
      return NextResponse.json({ success: true })
    }

    // Get admin email from settings
    const { data: settings } = await supabase
      .from('settings')
      .select('forgot_password_email')
      .single()

    const adminEmail = settings?.forgot_password_email || 'agkhushboo43@gmail.com'

    // Log the password reset request for admin to see
    // We'll store it in admin_audit_log
    await supabase
      .from('admin_audit_log')
      .insert({
        admin_id: null,
        action: 'PASSWORD_RESET_REQUEST',
        details: {
          user_email: email,
          user_name: profile.full_name,
          admin_email: adminEmail,
          requested_at: new Date().toISOString(),
        },
      })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Forgot password error:', error.message)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
