'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

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
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <Card className="w-full max-w-md border-zinc-200 shadow-lg">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="relative w-20 h-20 overflow-hidden rounded-2xl">
              <Image
                src="/anandam-logo.png"
                alt="Anandam - Level Up Buildcon"
                fill
                className="object-cover"
                priority
              />
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold">Level Up Buildcon</CardTitle>
            <CardDescription className="mt-1">Sign in to ProjectDesk</CardDescription>
          </div>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
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
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
            <Link href="/forgot-password" className="text-sm text-zinc-600 hover:text-zinc-900">
              Forgot password?
            </Link>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
