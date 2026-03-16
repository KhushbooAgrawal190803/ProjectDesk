'use client'

import { Building2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function LockedContent() {
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center">
            <Building2 className="w-9 h-9 text-white" />
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Level Up Buildcon</h1>
          <p className="text-sm text-zinc-500 mt-1">Booking Registry</p>
        </div>

        <div className="bg-white border border-zinc-200 rounded-2xl p-8 shadow-sm space-y-4">
          <div className="flex justify-center">
            <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center">
              <Lock className="w-6 h-6 text-zinc-400" />
            </div>
          </div>
          <h2 className="text-lg font-semibold text-zinc-800">System Restricted</h2>
          <p className="text-sm text-zinc-500 leading-relaxed">
            Access to this system has been restricted by the administrator.
            Please contact your administrator for assistance.
          </p>
          <Button variant="outline" className="w-full mt-2" onClick={handleSignOut}>
            Sign Out
          </Button>
        </div>

        <p className="text-xs text-zinc-400">Internal use only</p>
      </div>
    </div>
  )
}
