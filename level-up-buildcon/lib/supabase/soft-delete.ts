/**
 * Soft-delete column availability check.
 * The `deleted_at` and `deleted_by` columns are added via migration.
 * If the migration hasn't been applied yet we skip the filter so queries
 * still work — the filter kicks in automatically once the column exists.
 */

let _hasSoftDelete: boolean | null = null

export async function softDeleteAvailable(): Promise<boolean> {
  if (_hasSoftDelete !== null) return _hasSoftDelete

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/bookings?select=deleted_at&limit=0`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        },
      }
    )
    _hasSoftDelete = res.ok
  } catch {
    _hasSoftDelete = false
  }

  return _hasSoftDelete
}

/** Apply `.is('deleted_at', null)` only when the column exists. */
export function applyDeletedFilter<T extends object>(
  query: T,
  available: boolean
): T {
  if (!available) return query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (query as any).is('deleted_at', null) as T
}
