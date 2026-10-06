import Image from 'next/image'
import { ReactNode } from 'react'

interface AuthShellProps {
  children: ReactNode
  title: string
  description?: string
}

export function AuthShell({ children, title, description }: AuthShellProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-4 py-12">
      <Image
        src="/anandam-ranchi-east.jpg"
        alt=""
        fill
        priority
        className="object-cover object-center"
        sizes="100vw"
      />
      <div className="pointer-events-none absolute inset-0 bg-zinc-950/55" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 100%, rgba(9,9,11,0.45), transparent)',
        }}
      />

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <p className="text-lg font-semibold tracking-tight text-white">Level Up Buildcon</p>
          <p className="text-sm text-zinc-300">ProjectDesk</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/95 p-8 shadow-2xl shadow-black/30 backdrop-blur-sm">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{title}</h1>
            {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
