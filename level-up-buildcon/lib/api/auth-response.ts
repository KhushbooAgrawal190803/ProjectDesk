import { NextResponse } from 'next/server'
import { authErrorStatus, isAuthError } from '@/lib/auth/errors'

export function jsonAuthError(error: unknown) {
  if (isAuthError(error)) {
    return NextResponse.json({ error: error.message }, { status: authErrorStatus(error) })
  }
  return null
}
