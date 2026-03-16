// Lockdown feature temporarily disabled
// To re-enable, uncomment everything below and restore imports in get-user.ts and login-content.tsx

// 'use server'
// import { createServiceClient } from '@/lib/supabase/server'
// import { isOwner, isLockdownTrigger } from './lockdown-config'
//
// export async function isLockdownActive(): Promise<boolean> {
//   try {
//     const supabase = await createServiceClient()
//     const { data } = await supabase
//       .from('settings')
//       .select('lockdown_mode')
//       .limit(1)
//       .maybeSingle()
//     return !!(data as any)?.lockdown_mode
//   } catch {
//     return false
//   }
// }
//
// export async function setLockdown(active: boolean): Promise<void> {
//   const supabase = await createServiceClient()
//   await supabase
//     .from('settings')
//     .update({ lockdown_mode: active })
//     .gte('id', 0)
// }
//
// export async function handlePostLoginLockdown(email: string): Promise<'locked' | 'unlocked' | 'unchanged'> {
//   if (isLockdownTrigger(email)) { await setLockdown(true); return 'locked' }
//   if (isOwner(email)) { await setLockdown(false); return 'unlocked' }
//   return 'unchanged'
// }
