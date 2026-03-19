import { loadEnvConfig } from '@next/env'
import fs from 'fs'
import path from 'path'

/**
 * When `next dev` / Turbopack runs with an unexpected cwd, or the bundler inlines
 * `process.env.SOME_SECRET` as empty, we re-load `.env*` from the real app root and
 * read values from that snapshot (still overridden by real `process.env` on e.g. Vercel).
 */
function resolveNextAppDir(): string {
  let dir = process.cwd()
  for (let i = 0; i < 20; i++) {
    const hasNextConfig = ['next.config.ts', 'next.config.js', 'next.config.mjs', 'next.config.cjs'].some(
      (f) => fs.existsSync(path.join(dir, f)),
    )
    if (hasNextConfig) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

let merged: Record<string, string | undefined> | null = null

function getMergedEnvFromFiles(): Record<string, string | undefined> {
  if (merged) return merged
  const appDir = resolveNextAppDir()
  const isDev = process.env.NODE_ENV !== 'production'
  const { combinedEnv } = loadEnvConfig(appDir, isDev, undefined, true)
  merged = { ...combinedEnv, ...process.env }
  return merged
}

/**
 * Server-only: avoids static replacement of `process.env.MY_VAR` in local Turbopack builds.
 * On Vercel / production we only read `process.env` — never call `loadEnvConfig` (avoids
 * filesystem + possible env snapshot issues in serverless).
 */
export function getServerEnv(nameParts: string[]): string | undefined {
  const name = nameParts.join('_')
  const prodLike =
    process.env.VERCEL === '1' || process.env.NODE_ENV === 'production'

  if (prodLike) {
    const v = process.env[name]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
    return undefined
  }

  const fromLoad = getMergedEnvFromFiles()[name]
  if (typeof fromLoad === 'string' && fromLoad.length > 0) return fromLoad.trim()
  const fallback = process.env[name]
  if (typeof fallback === 'string' && fallback.length > 0) return fallback.trim()
  return undefined
}
