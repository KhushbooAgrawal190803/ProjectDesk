'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { AuthShell } from '@/components/layout/auth-shell'
import { Loader2 } from 'lucide-react'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [validToken, setValidToken] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setValidToken(true)
      } else {
        toast.error('Invalid or expired link', {
          description: 'Please request a new password reset link.',
        })
        setTimeout(() => router.push('/forgot-password'), 3000)
      }
    })
  }, [router])

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      toast.error('Passwords do not match', {
        description: 'Please make sure both passwords are the same.',
      })
      return
    }

    if (password.length < 8) {
      toast.error('Password too short', {
        description: 'Password must be at least 8 characters long.',
      })
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()

      const { error } = await supabase.auth.updateUser({
        password: password,
      })

      if (error) {
        toast.error('Failed to reset password', {
          description: error.message,
        })
        return
      }

      toast.success('Password reset successful', {
        description: 'You can now sign in with your new password.',
      })

      setTimeout(() => router.push('/login'), 1500)
    } catch {
      toast.error('Something went wrong', {
        description: 'Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }

  if (!validToken) {
    return (
      <AuthShell title="Verifying…" description="Please wait while we verify your reset link.">
        <div className="flex justify-center py-6">
          <Loader2 className="size-8 animate-spin text-zinc-400" />
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Reset password" description="Enter your new password below.">
      <form onSubmit={handleResetPassword} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="Re-enter your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={loading}
            className="h-11"
          />
        </div>
        <Button type="submit" className="h-11 w-full" disabled={loading}>
          {loading ? 'Resetting…' : 'Reset Password'}
        </Button>
        <Link href="/login" className="block">
          <Button variant="ghost" className="h-11 w-full text-zinc-600">
            Back to Sign In
          </Button>
        </Link>
      </form>
    </AuthShell>
  )
}
