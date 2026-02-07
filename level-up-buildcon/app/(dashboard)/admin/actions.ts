'use server'

import { requireRole } from '@/lib/auth/get-user'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { UserRole, UserStatus } from '@/lib/types/database'

export async function getUsers() {
  await requireRole(['ADMIN'])
  
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (error) {
    throw new Error('Failed to fetch users')
  }
  
  return data
}

export async function getUserStats() {
  await requireRole(['ADMIN'])
  
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
  
  const staffCount = roleBreakdown?.filter(p => p.role === 'STAFF').length || 0
  const executiveCount = roleBreakdown?.filter(p => p.role === 'EXECUTIVE').length || 0
  const adminCount = roleBreakdown?.filter(p => p.role === 'ADMIN').length || 0
  
  return {
    totalUsers: totalUsers || 0,
    activeUsers: activeUsers || 0,
    pendingUsers: pendingUsers || 0,
    staffCount,
    executiveCount,
    adminCount,
  }
}

export async function approveUser(userId: string) {
  const profile = await requireRole(['ADMIN'])
  
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('profiles')
    .update({ status: 'ACTIVE' })
    .eq('id', userId)
  
  if (error) {
    throw new Error('Failed to approve user')
  }
  
  // Log action
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
  
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId)
  
  if (error) {
    throw new Error('Failed to update role')
  }
  
  // Log action
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
  
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('profiles')
    .update({ status })
    .eq('id', userId)
  
  if (error) {
    throw new Error('Failed to update status')
  }
  
  // Log action
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
  tempPassword?: string
}) {
  const profile = await requireRole(['ADMIN'])
  
  const serviceSupabase = await createServiceClient()
  
  // Create auth user
  const { data: authData, error: authError } = await serviceSupabase.auth.admin.createUser({
    email: data.email,
    password: data.tempPassword || Math.random().toString(36).slice(-12),
    email_confirm: true,
  })
  
  if (authError) {
    throw new Error(`Failed to create user: ${authError.message}`)
  }
  
  // Create profile
  const { error: profileError } = await serviceSupabase
    .from('profiles')
    .insert({
      id: authData.user.id,
      email: data.email,
      full_name: data.fullName,
      role: data.role,
      status: 'ACTIVE',
    })
  
  if (profileError) {
    // Rollback auth user
    await serviceSupabase.auth.admin.deleteUser(authData.user.id)
    throw new Error('Failed to create profile')
  }
  
  // Send password reset email
  await serviceSupabase.auth.resetPasswordForEmail(data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
  })
  
  // Log action
  const supabase = await createClient()
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
  
  const serviceSupabase = await createServiceClient()
  
  const { error } = await serviceSupabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
  })
  
  if (error) {
    throw new Error('Failed to send password reset email')
  }
  
  return { success: true }
}

export async function getSettings() {
  await requireRole(['ADMIN'])
  
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .single()
  
  if (error) {
    throw new Error('Failed to fetch settings')
  }
  
  return data
}

export async function updateSettings(settings: {
  allow_self_signup?: boolean
  serial_prefix?: string
  default_project_location?: string
}) {
  await requireRole(['ADMIN'])
  
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('settings')
    .update(settings)
    .eq('id', (await getSettings()).id)
  
  if (error) {
    throw new Error('Failed to update settings')
  }
  
  revalidatePath('/admin')
  return { success: true }
}

