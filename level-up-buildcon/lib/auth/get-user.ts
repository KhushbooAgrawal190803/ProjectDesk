import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Profile } from '@/lib/types/database'
// import { isLockdownActive } from '@/lib/auth/lockdown'
// import { isOwner } from '@/lib/auth/lockdown-config'

export async function getCurrentUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

export async function getCurrentProfile(): Promise<Profile | null> {
  // 1. Verify auth session
  const user = await getCurrentUser()
  if (!user) return null

  // 2. Use service role to fetch profile (bypasses RLS completely)
  const supabase = await createServiceClient()
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error || !profile) return null
  return profile as Profile
}

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')
  return user
}

export async function requireProfile() {
  const profile = await getCurrentProfile()
  if (!profile || profile.status !== 'ACTIVE') {
    redirect('/login')
  }
  // Lockdown feature temporarily disabled
  // if (!isOwner(profile.email)) {
  //   const locked = await isLockdownActive()
  //   if (locked) redirect('/locked')
  // }
  return profile
}

export async function requireRole(roles: string[]) {
  const profile = await requireProfile()
  if (!roles.includes(profile.role)) {
    redirect('/login')
  }
  return profile
}
