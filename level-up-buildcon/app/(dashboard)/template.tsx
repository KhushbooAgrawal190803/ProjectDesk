'use client'

import { useEffect } from 'react'
import NProgress from 'nprogress'

export default function Template({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    NProgress.done()
  }, [])

  return <>{children}</>
}
