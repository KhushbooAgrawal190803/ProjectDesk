'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import NProgress from 'nprogress'

export function LoadingBar() {
  const pathname = usePathname()

  useEffect(() => {
    NProgress.configure({ 
      showSpinner: false,
      trickleSpeed: 100,
      minimum: 0.2
    })
  }, [])

  useEffect(() => {
    NProgress.done()
  }, [pathname])

  return null
}
