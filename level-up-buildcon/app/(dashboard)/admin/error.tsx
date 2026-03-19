'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Surfaces admin RSC failures. In production, `error.message` may still be generic;
 * use Vercel Runtime Logs or run `npm run build && npm run start` locally to see the real stack.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Admin route error:', error)
  }, [error])

  return (
    <div className="mx-auto max-w-lg space-y-4 p-8 text-center">
      <h2 className="text-lg font-semibold text-zinc-900">Admin couldn&apos;t load</h2>
      <p className="text-sm text-zinc-600">
        {process.env.NODE_ENV === 'development'
          ? error.message
          : 'Something went wrong while rendering this page. Check Vercel logs for the matching digest, or reproduce locally with a production build.'}
      </p>
      {error.digest ? (
        <p className="font-mono text-xs text-zinc-500">Digest: {error.digest}</p>
      ) : null}
      <Button type="button" variant="outline" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  )
}
