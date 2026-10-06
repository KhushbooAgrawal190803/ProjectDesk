import { describe, expect, it } from 'vitest'
import type { Profile } from '@/lib/types/database'
import {
  canApproveOrRejectBooking,
  canDeleteOrRestoreBooking,
  canEditBooking,
  canEditOwnDraft,
  canManageUsers,
  submitStatusForRole,
} from './permissions'
import { ForbiddenError } from './errors'
import { assertCanDownloadPdfs } from './permissions'

const executive = (id = 'e1'): Profile => ({
  id,
  full_name: 'Exec',
  email: 'e@test.com',
  role: 'EXECUTIVE',
  status: 'ACTIVE',
  created_at: '',
  updated_at: '',
})

const admin = (): Profile => ({
  id: 'a1',
  full_name: 'Admin',
  email: 'a@test.com',
  role: 'ADMIN',
  status: 'ACTIVE',
  created_at: '',
  updated_at: '',
})

describe('submitStatusForRole', () => {
  it('executive submit → PENDING', () => {
    expect(submitStatusForRole('EXECUTIVE')).toBe('PENDING')
  })
  it('admin submit → SUBMITTED', () => {
    expect(submitStatusForRole('ADMIN')).toBe('SUBMITTED')
  })
})

describe('role capabilities', () => {
  it('executive cannot approve', () => {
    expect(canApproveOrRejectBooking(executive())).toBe(false)
  })
  it('admin can approve', () => {
    expect(canApproveOrRejectBooking(admin())).toBe(true)
  })
  it('executive cannot delete', () => {
    expect(canDeleteOrRestoreBooking(executive())).toBe(false)
  })
  it('admin can delete', () => {
    expect(canDeleteOrRestoreBooking(admin())).toBe(true)
  })
  it('executive cannot manage users', () => {
    expect(canManageUsers(executive())).toBe(false)
  })
})

describe('canEditBooking', () => {
  it('executive can edit own pending draft path', () => {
    expect(
      canEditBooking(executive(), { status: 'PENDING', created_by: 'e1', deleted_at: null })
    ).toBe(true)
  })
  it('executive cannot edit another users pending', () => {
    expect(
      canEditBooking(executive(), { status: 'PENDING', created_by: 'other', deleted_at: null })
    ).toBe(false)
  })
  it('admin can edit submitted', () => {
    expect(
      canEditBooking(admin(), { status: 'SUBMITTED', created_by: 'e1', deleted_at: null })
    ).toBe(true)
  })
})

describe('canEditOwnDraft', () => {
  it('allows own draft', () => {
    expect(canEditOwnDraft(executive(), { status: 'DRAFT', created_by: 'e1' })).toBe(true)
  })
  it('denies others draft', () => {
    expect(canEditOwnDraft(executive(), { status: 'DRAFT', created_by: 'x' })).toBe(false)
  })
})

describe('assertCanDownloadPdfs', () => {
  it('staff can download active booking', () => {
    expect(() =>
      assertCanDownloadPdfs(executive(), { status: 'SUBMITTED', created_by: 'x', deleted_at: null })
    ).not.toThrow()
  })
  it('executive cannot download soft-deleted booking', () => {
    expect(() =>
      assertCanDownloadPdfs(executive(), {
        status: 'SUBMITTED',
        created_by: 'x',
        deleted_at: new Date().toISOString(),
      })
    ).toThrow(ForbiddenError)
  })
})
