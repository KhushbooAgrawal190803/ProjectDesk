'use client'

import { useEffect, useState } from 'react'

export function istDateLabel(now = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now)
}

export function IstDate() {
  const [label, setLabel] = useState('')
  useEffect(() => {
    const tick = () => setLabel(istDateLabel())
    tick()
    const timer = window.setInterval(tick, 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return <p className="text-sm text-zinc-500">{label}</p>
}
