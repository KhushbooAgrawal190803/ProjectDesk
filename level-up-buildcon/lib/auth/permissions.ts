import type { BookingStatus, Profile } from '@/lib/types/database'
import { ForbiddenError } from './errors'

/** Active staff roles in ProjectDesk (ACCOUNTS removed). */
export type StaffRole = 'EXECUTIVE' | 'ADMIN'

export function isAdmin(profile: Pick<Profile, 'role'>): boolean {
  return profile.role === 'ADMIN'
}

export function isExecutive(profile: Pick<Profile, 'role'>): boolean {
  return profile.role === 'EXECUTIVE'
}

export function isStaff(profile: Pick<Profile, 'role'>): boolean {
  return isExecutive(profile) || isAdmin(profile)
}

export function assertStaff(profile: Pick<Profile, 'role'>): void {
  if (!isStaff(profile)) {
    throw new ForbiddenError('Staff access required')
  }
}

export function assertAdmin(profile: Pick<Profile, 'role'>): void {
  if (!isAdmin(profile)) {
    throw new ForbiddenError('Admin access required')
  }
}

type BookingAccess = {
  status: BookingStatus
  created_by: string
  deleted_at?: string | null
}

/** View booking list/detail — all active staff; soft-deleted only for admins. */
export function assertCanViewBooking(profile: Pick<Profile, 'role'>, booking: BookingAccess): void {
  assertStaff(profile)
  if (booking.deleted_at && !isAdmin(profile)) {
    throw new ForbiddenError('This booking is not available')
  }
}

/** Submit creates PENDING (executive) or SUBMITTED (admin). */
export function submitStatusForRole(role: StaffRole): 'PENDING' | 'SUBMITTED' {
  return role === 'ADMIN' ? 'SUBMITTED' : 'PENDING'
}

export function canApproveOrRejectBooking(profile: Pick<Profile, 'role'>): boolean {
  return isAdmin(profile)
}

export function canDeleteOrRestoreBooking(profile: Pick<Profile, 'role'>): boolean {
  return isAdmin(profile)
}

export function canManageUsers(profile: Pick<Profile, 'role'>): boolean {
  return isAdmin(profile)
}

export function canAccessAdminSettings(profile: Pick<Profile, 'role'>): boolean {
  return isAdmin(profile)
}

export function canRecordPayments(profile: Pick<Profile, 'role'>): boolean {
  return isStaff(profile)
}

export function canDownloadBookingPdfs(profile: Pick<Profile, 'role'>): boolean {
  return isStaff(profile)
}

/**
 * Edit rules:
 * - Admin: any non-deleted booking
 * - Executive: own DRAFT/PENDING; any SUBMITTED/EDITED (operational corrections)
 * - Executive cannot edit another user's PENDING (awaiting approval)
 */
export function canEditBooking(profile: Pick<Profile, 'role' | 'id'>, booking: BookingAccess): boolean {
  if (booking.deleted_at) return false
  if (isAdmin(profile)) return true
  if (!isExecutive(profile)) return false

  if (booking.status === 'PENDING' && booking.created_by !== profile.id) {
    return false
  }

  return ['DRAFT', 'PENDING', 'SUBMITTED', 'EDITED'].includes(booking.status)
}

/** Wizard/resume: own drafts and pending only. */
export function canEditOwnDraft(profile: Pick<Profile, 'id' | 'role'>, booking: BookingAccess): boolean {
  if (booking.deleted_at) return false
  if (booking.created_by !== profile.id) return false
  return booking.status === 'DRAFT' || booking.status === 'PENDING'
}

export function assertCanEditBooking(profile: Profile, booking: BookingAccess): void {
  assertStaff(profile)
  if (!canEditBooking(profile, booking)) {
    throw new ForbiddenError('You do not have permission to edit this booking')
  }
}

export function assertCanApproveBooking(profile: Profile): void {
  assertAdmin(profile)
}

export function assertCanDeleteBooking(profile: Profile): void {
  assertAdmin(profile)
}

export function assertCanManageUsers(profile: Profile): void {
  assertAdmin(profile)
}

export function assertCanDownloadPdfs(profile: Profile, booking: BookingAccess): void {
  assertStaff(profile)
  assertCanViewBooking(profile, booking)
}

export function assertCanRecordPayment(profile: Profile): void {
  assertStaff(profile)
}

export function assertCanEditOwnDraft(profile: Profile, booking: BookingAccess): void {
  assertStaff(profile)
  if (!canEditOwnDraft(profile, booking)) {
    throw new ForbiddenError('You do not have permission to edit this draft')
  }
}

/** Admin creates EXECUTIVE accounts only (no self-serve admin escalation via UI). */
export function assertValidNewUserRole(role: StaffRole, creator: Profile): void {
  assertCanManageUsers(creator)
  if (role === 'ADMIN' && !isAdmin(creator)) {
    throw new ForbiddenError('Cannot assign admin role')
  }
}
