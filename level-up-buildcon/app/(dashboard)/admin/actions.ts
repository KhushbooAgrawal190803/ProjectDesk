'use server'

import { requireAdmin } from '@/lib/auth/get-user'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { UserRole, UserStatus } from '@/lib/types/database'

export async function getUsers() {
  await requireAdmin()

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch users: ${error.message}`)
  }

  return data
}

export async function getUserStats() {
  await requireAdmin()

  const supabase = await createClient()

  const { count: totalUsers } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })

  const { count: activeUsers } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'ACTIVE')

  const { count: pendingUsers } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'PENDING')

  const { data: roleBreakdown } = await supabase
    .from('profiles')
    .select('role')

  const executiveCount = roleBreakdown?.filter((p) => p.role === 'EXECUTIVE').length || 0
  const adminCount = roleBreakdown?.filter((p) => p.role === 'ADMIN').length || 0

  return {
    totalUsers: totalUsers || 0,
    activeUsers: activeUsers || 0,
    pendingUsers: pendingUsers || 0,
    executiveCount,
    adminCount,
  }
}

export async function approveUser(userId: string) {
  const profile = await requireAdmin()

  const supabase = await createClient()

  const { error } = await supabase
    .from('profiles')
    .update({ status: 'ACTIVE' })
    .eq('id', userId)

  if (error) {
    throw new Error(`Failed to approve user: ${error.message}`)
  }

  await supabase
    .from('admin_audit_log')
    .insert({
      admin_id: profile.id,
      action: 'USER_APPROVED',
      target_user_id: userId,
    })

  revalidatePath('/admin')
  return { success: true }
}

export async function changeUserRole(userId: string, role: UserRole) {
  const profile = await requireAdmin()
  if (role !== 'EXECUTIVE' && role !== 'ADMIN') {
    throw new Error('Invalid role')
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId)

  if (error) {
    throw new Error(`Failed to update role: ${error.message}`)
  }

  await supabase
    .from('admin_audit_log')
    .insert({
      admin_id: profile.id,
      action: 'ROLE_CHANGED',
      target_user_id: userId,
      details: { new_role: role },
    })

  revalidatePath('/admin')
  return { success: true }
}

export async function changeUserStatus(userId: string, status: UserStatus) {
  const profile = await requireAdmin()

  const supabase = await createClient()

  const { error } = await supabase
    .from('profiles')
    .update({ status })
    .eq('id', userId)

  if (error) {
    throw new Error(`Failed to update status: ${error.message}`)
  }

  const action = status === 'DISABLED' ? 'USER_DISABLED' : 'USER_ENABLED'
  await supabase
    .from('admin_audit_log')
    .insert({
      admin_id: profile.id,
      action,
      target_user_id: userId,
    })

  revalidatePath('/admin')
  return { success: true }
}

export async function createUser(data: {
  email: string
  fullName: string
  role: UserRole
  password: string
}): Promise<{ success: true; userId: string } | { success: false; error: string }> {
  const profile = await requireAdmin()

  if (!data.password || data.password.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters.' }
  }
  if (data.role !== 'EXECUTIVE' && data.role !== 'ADMIN') {
    return { success: false, error: 'Choose Executive or Admin.' }
  }
  const email = data.email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { success: false, error: 'Enter a valid email address.' }
  }

  // The only service-role use in the app: creating (and on failure, deleting)
  // a Supabase Auth user requires the Auth Admin API. requireAdmin() above is
  // the authorization check; the service client bypasses RLS from here on.
  let supabase
  try {
    supabase = await createServiceClient()
  } catch {
    return { success: false, error: 'User creation is not configured on this server. Add SUPABASE_SERVICE_ROLE_KEY in the Vercel project settings, then redeploy.' }
  }

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: data.password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    const message = authError?.message || 'The account could not be created.'
    return { success: false, error: /already.*(registered|exists)/i.test(message) ? 'An account with this email already exists.' : message }
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: authData.user.id,
      email,
      full_name: data.fullName.trim(),
      role: data.role,
      status: 'ACTIVE',
    })

  if (profileError) {
    await supabase.auth.admin.deleteUser(authData.user.id)
    return { success: false, error: profileError.message }
  }

  await supabase
    .from('admin_audit_log')
    .insert({
      admin_id: profile.id,
      action: 'USER_CREATED',
      target_user_id: authData.user.id,
      details: { email: data.email, role: data.role },
    })

  revalidatePath('/admin')
  return { success: true, userId: authData.user.id }
}

export async function sendPasswordReset(email: string) {
  await requireAdmin()

  const supabase = await createClient()

  // Supabase Auth sends this email itself; ProjectDesk has no mail server.
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
  })

  if (error) {
    throw new Error(`Failed to send password reset: ${error.message}`)
  }

  return { success: true }
}

export async function getSettings() {
  await requireAdmin()

  const supabase = await createClient()

  const { data, error } = await supabase.from('settings').select('*').single()

  if (error || !data) {
    throw new Error('Settings row is missing. Run supabase/schema.sql, which seeds it.')
  }

  return data
}

export async function updateSettings(settings: {
  serial_prefix?: string
  default_project_location?: string
}) {
  await requireAdmin()

  const supabase = await createClient()

  const { data: existing, error: fetchError } = await supabase
    .from('settings')
    .select('id')
    .single()

  if (fetchError || !existing) {
    throw new Error('Failed to find settings row')
  }

  const { error } = await supabase
    .from('settings')
    .update({
      serial_prefix: settings.serial_prefix,
      default_project_location: settings.default_project_location,
    })
    .eq('id', existing.id)

  if (error) {
    throw new Error(`Failed to update settings: ${error.message}`)
  }

  revalidatePath('/admin')
  return { success: true }
}
