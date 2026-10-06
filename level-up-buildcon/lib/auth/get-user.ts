import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Profile } from '@/lib/types/database'
import { ForbiddenError, UnauthorizedError } from './errors'
import { assertAdmin, assertStaff, type StaffRole } from './permissions'

export async function getCurrentUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

/** Profile via authenticated client — RLS allows users to read their own row. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const user = await getCurrentUser()
  if (!user) return null

  const supabase = await createClient()
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error || !profile) return null
  return profile as Profile
}

async function requireActiveProfile(): Promise<Profile> {
  const profile = await getCurrentProfile()
  if (!profile || profile.status !== 'ACTIVE') {
    throw new UnauthorizedError()
  }
  return profile
}

/** Pages: redirect unauthenticated/inactive users to login. */
export async function requireProfile(): Promise<Profile> {
  try {
    return await requireActiveProfile()
  } catch {
    redirect('/login')
  }
}

/** Pages: staff only; others sent to login. */
export async function requireStaffPage(): Promise<Profile> {
  const profile = await requireProfile()
  if (profile.role !== 'EXECUTIVE' && profile.role !== 'ADMIN') {
    redirect('/login')
  }
  return profile
}

/** Pages: admin only; others sent to dashboard. */
export async function requireAdminPage(): Promise<Profile> {
  const profile = await requireProfile()
  if (profile.role !== 'ADMIN') {
    redirect('/dashboard')
  }
  return profile
}

/** Server actions / API: throws UnauthorizedError or ForbiddenError (never redirects). */
export async function requireStaff(): Promise<Profile> {
  const profile = await requireActiveProfile()
  assertStaff(profile)
  return profile
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireActiveProfile()
  assertAdmin(profile)
  return profile
}

/** @deprecated Use requireStaff() or requireAdmin() in actions; requireAdminPage() in pages. */
export async function requireRole(roles: StaffRole[]): Promise<Profile> {
  const profile = await requireActiveProfile()
  if (!roles.includes(profile.role as StaffRole)) {
    throw new ForbiddenError()
  }
  return profile
}

export { ForbiddenError, UnauthorizedError }
