import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cache } from 'react'
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

/**
 * The signed-in user's id. getClaims() checks the session token's signature and
 * expiry on the server using the project's published signing key, so most pages
 * skip a round trip to Supabase Auth. It falls back to asking Auth when needed.
 */
async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims?.sub) return null
  return data.claims.sub
}

/**
 * Profile via authenticated client — RLS allows users to read their own row.
 * Read from the database on every request, so a deactivated account is refused at once.
 * Cached per request, so several checks in one page cost one lookup.
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const userId = await getCurrentUserId()
  if (!userId) return null

  const supabase = await createClient()
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error || !profile) return null
  return profile as Profile
})

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
    // Auth cookie without a readable profile (missing row or table grants) used to
    // loop with proxy's login → dashboard redirect. Clear the stale session.
    const user = await getCurrentUser()
    if (user) {
      const supabase = await createClient()
      await supabase.auth.signOut()
    }
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
