'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { AuthShell } from '@/components/layout/auth-shell'
import { Loader2 } from 'lucide-react'

export default function LoginContent() {
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const supabase = createClient()

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      })

      if (error || !data.user) {
        toast.error('Login failed', {
          description: 'Invalid email or password.',
        })
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, status, role')
        .eq('id', data.user.id)
        .single()

      if (profileError || !profile) {
        await supabase.auth.signOut()
        const isPermissionError = profileError?.message?.includes('permission denied')
        toast.error('Cannot load your account', {
          description: isPermissionError
            ? 'Database table permissions are missing. Run supabase/migrations/003_grant_table_permissions.sql in the Supabase SQL Editor, then try again.'
            : 'Your login works but no profile row exists yet. Add an ACTIVE profile for this user in Supabase.',
        })
        return
      }

      if (profile.status !== 'ACTIVE') {
        await supabase.auth.signOut()
        toast.error('Account not active', {
          description: 'Your profile status is not ACTIVE. Contact an admin.',
        })
        return
      }

      if (profile.role !== 'EXECUTIVE' && profile.role !== 'ADMIN') {
        await supabase.auth.signOut()
        toast.error('Access denied', {
          description: 'This account does not have staff access.',
        })
        return
      }

      await supabase
        .from('profiles')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.user.id)

      toast.success('Welcome back!', {
        description: 'Logging you in...',
      })

      sessionStorage.setItem('lubc_tab', '1')
      window.location.href = redirect
    } catch {
      toast.error('Something went wrong', {
        description: 'Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Sign in">
      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
            autoComplete="email"
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
            className="h-11"
          />
        </div>

        <Button type="submit" className="mt-2 h-11 w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Signing in...
            </>
          ) : (
            'Sign In'
          )}
        </Button>

        <div className="text-center">
          <Link
            href="/forgot-password"
            className="text-sm text-zinc-600 transition-colors hover:text-zinc-900"
          >
            Forgot password?
          </Link>
        </div>
      </form>
    </AuthShell>
  )
}
