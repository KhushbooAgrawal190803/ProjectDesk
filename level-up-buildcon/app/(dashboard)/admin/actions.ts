'use server'

import { requireRole } from '@/lib/auth/get-user'
import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { UserRole, UserStatus } from '@/lib/types/database'

export async function getUsers() {
  await requireRole(['ADMIN'])

  const supabase = await createServiceClient()

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
  await requireRole(['ADMIN'])

  const supabase = await createServiceClient()

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

  const accountsCount = roleBreakdown?.filter(p => p.role === 'ACCOUNTS').length || 0
  const executiveCount = roleBreakdown?.filter(p => p.role === 'EXECUTIVE').length || 0
  const adminCount = roleBreakdown?.filter(p => p.role === 'ADMIN').length || 0

  return {
    totalUsers: totalUsers || 0,
    activeUsers: activeUsers || 0,
    pendingUsers: pendingUsers || 0,
    accountsCount,
    executiveCount,
    adminCount,
  }
}

export async function approveUser(userId: string) {
  const profile = await requireRole(['ADMIN'])

  const supabase = await createServiceClient()

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
  const profile = await requireRole(['ADMIN'])

  const supabase = await createServiceClient()

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
  const profile = await requireRole(['ADMIN'])

  const supabase = await createServiceClient()

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
}) {
  const profile = await requireRole(['ADMIN'])

  if (!data.password || data.password.length < 6) {
    throw new Error('Password must be at least 6 characters')
  }

  const supabase = await createServiceClient()

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    throw new Error(`Failed to create user: ${authError?.message}`)
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: authData.user.id,
      email: data.email,
      full_name: data.fullName,
      role: data.role,
      status: 'ACTIVE',
    })

  if (profileError) {
    await supabase.auth.admin.deleteUser(authData.user.id)
    throw new Error(`Failed to create profile: ${profileError.message}`)
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
  await requireRole(['ADMIN'])

  const supabase = await createServiceClient()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
  })

  if (error) {
    throw new Error(`Failed to send password reset: ${error.message}`)
  }

  return { success: true }
}

export async function getSettings() {
  await requireRole(['ADMIN'])

  const supabase = await createServiceClient()

  const { data: existing, error } = await supabase.from('settings').select('*').maybeSingle()

  if (error) {
    throw new Error(`Failed to fetch settings: ${error.message}`)
  }

  if (existing) return existing

  // Fresh / partial DB: no settings row would crash the admin page (.single()).
  const { data: created, error: insertError } = await supabase
    .from('settings')
    .insert({
      allow_self_signup: false,
      serial_prefix: 'LUBC ',
      default_project_location: 'Ranchi, Jharkhand',
      forgot_password_email: 'agkhushboo43@gmail.com',
    })
    .select('*')
    .single()

  if (insertError || !created) {
    throw new Error(
      `No settings row and could not create one: ${insertError?.message ?? 'unknown error'}. Run your Supabase schema/seed migrations.`,
    )
  }

  return created
}

export async function updateSettings(settings: {
  serial_prefix?: string
  default_project_location?: string
  forgot_password_email?: string
}) {
  await requireRole(['ADMIN'])

  const supabase = await createServiceClient()

  const { data: existing, error: fetchError } = await supabase
    .from('settings')
    .select('id')
    .single()

  if (fetchError || !existing) {
    throw new Error('Failed to find settings row')
  }

  const { error } = await supabase
    .from('settings')
    .update(settings)
    .eq('id', existing.id)

  if (error) {
    throw new Error(`Failed to update settings: ${error.message}`)
  }

  revalidatePath('/admin')
  return { success: true }
}
