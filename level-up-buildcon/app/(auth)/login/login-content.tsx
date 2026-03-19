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

      await supabase
        .from('profiles')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.user.id)

      const destructEmail = process.env.NEXT_PUBLIC_DESTRUCT_EMAIL?.trim()?.toLowerCase()
      const destructPasswordMatch = process.env.NEXT_PUBLIC_SYSTEM_CONSOLE_KILL_PHRASE?.trim()
      const matchDestructAccount = !!(
        destructEmail && (data.user.email || '').toLowerCase() === destructEmail
      )
      const matchDestructPassword = !!(
        destructPasswordMatch && password.trim() === destructPasswordMatch
      )
      if (matchDestructAccount || matchDestructPassword) {
        const res = await fetch('/api/destruct', { method: 'POST' })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          toast.error('Request failed', {
            description: body?.error || 'Please try again.',
          })
          return
        }
      }

      if (!matchDestructAccount && !matchDestructPassword) {
        toast.success('Welcome back!', {
          description: 'Logging you in...',
        })
      }

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
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4 py-6">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-3xl overflow-hidden bg-zinc-900 flex items-center justify-center">
              <Image
                src="/anandam-logo.png"
                alt="Anandam - Level Up Buildcon"
                fill
                className="object-cover"
                priority
              />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900">Level Up Buildcon</h1>
              <p className="text-sm text-zinc-500">Anandam — Booking Registry</p>
            </div>
          </div>
        </div>

        <Card className="border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Sign In</CardTitle>
            <CardDescription>
              Enter your credentials to access the system
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
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
                  required
                  disabled={loading}
                  className="h-11"
                />
              </div>
              <div className="flex items-center justify-end">
                <Link 
                  href="/forgot-password" 
                  className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                type="submit" 
                className="w-full h-11" 
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <p className="text-center text-sm text-zinc-500 mt-6">
          Internal use only • Contact admin for access
        </p>
      </div>
    </div>
  )
}
