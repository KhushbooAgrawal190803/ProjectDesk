import { createClient } from '@/lib/supabase/server'
import { Profile } from '@/lib/types/database'

export async function getCurrentUser() {
  const supabase = await createClient()
  
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  return user
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient()
  
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return null
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return null
  }

  return profile as Profile
}

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('Unauthorized')
  }
  return user
}

export async function requireProfile() {
  const profile = await getCurrentProfile()
  if (!profile || profile.status !== 'ACTIVE') {
    throw new Error('Unauthorized or account not active')
  }
  return profile
}

export async function requireRole(roles: string[]) {
  const profile = await requireProfile()
  if (!roles.includes(profile.role)) {
    throw new Error('Insufficient permissions')
  }
  return profile
}

