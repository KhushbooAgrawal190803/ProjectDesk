'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Building2 } from 'lucide-react'

const BOOTSTRAP_ADMIN_EMAILS = process.env.NEXT_PUBLIC_BOOTSTRAP_ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

export default function SignupPage() {
  const router = useRouter()
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()
      
      // Sign up the user
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      })

      if (error) {
        toast.error('Signup failed', {
          description: error.message,
        })
        return
      }

      if (!data.user) {
        toast.error('Signup failed', {
          description: 'Could not create account',
        })
        return
      }

      // Determine role based on bootstrap admin list
      const isBootstrapAdmin = BOOTSTRAP_ADMIN_EMAILS.includes(email.toLowerCase())
      const role = isBootstrapAdmin ? 'ADMIN' : 'STAFF'
      const status = isBootstrapAdmin ? 'ACTIVE' : 'ACTIVE' // For now, all accounts are active

      // Create profile
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: data.user.id,
          email: email,
          full_name: fullName,
          role: role,
          status: status,
        })

      if (profileError) {
        console.error('Profile creation error:', profileError)
        toast.error('Account created but profile setup failed', {
          description: 'Please contact an administrator',
        })
        return
      }

      toast.success('Account created successfully!', {
        description: isBootstrapAdmin ? 'You have been granted ADMIN access' : 'Please log in to continue',
      })
      
      // Redirect to login
      setTimeout(() => {
        router.push('/login')
      }, 1500)

    } catch (error) {
      toast.error('Something went wrong', {
        description: 'Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-zinc-900 rounded-xl flex items-center justify-center">
              <Building2 className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900">Level Up Buildcon</h1>
              <p className="text-sm text-zinc-500">Booking Registry</p>
            </div>
          </div>
        </div>

        <Card className="border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Create Account</CardTitle>
            <CardDescription>
              Enter your details to create an account
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSignup}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  disabled={loading}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
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
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="h-11"
                  minLength={8}
                />
                <p className="text-xs text-zinc-500">Must be at least 8 characters</p>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button 
                type="submit" 
                className="w-full h-11" 
                disabled={loading}
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </Button>
              <p className="text-sm text-zinc-600 text-center">
                Already have an account?{' '}
                <Link href="/login" className="text-zinc-900 font-medium hover:underline">
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>

        <p className="text-center text-sm text-zinc-500 mt-6">
          Internal use only • Staff access required
        </p>
      </div>
    </div>
  )
}
