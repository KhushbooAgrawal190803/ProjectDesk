'use client'

import { useEffect, useRef } from 'react'

/**
 * A step's values only reach the wizard when "Next" is pressed. Autosave needs
 * what is on screen right now, so each step registers a function that collects
 * its current values (without validating them) and the wizard calls it on save.
 */
export type DraftSnapshot = Record<string, unknown>
export type SnapshotRegistrar = (collect: (() => DraftSnapshot) | null) => void

export function useDraftSnapshot(register: SnapshotRegistrar | undefined, collect: () => DraftSnapshot) {
  const latest = useRef(collect)
  useEffect(() => {
    latest.current = collect
  })
  useEffect(() => {
    if (!register) return
    register(() => latest.current())
    return () => register(null)
  }, [register])
}
