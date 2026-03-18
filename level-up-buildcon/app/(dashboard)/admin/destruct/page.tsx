'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldAlert, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { runDestruct } from '../destruct-actions'

export default function DestructPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [isRunning, setIsRunning] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (confirmText !== 'DELETE ALL BOOKINGS') {
      toast.error('Type DELETE ALL BOOKINGS exactly to confirm.')
      return
    }
    try {
      setIsRunning(true)
      const result = await runDestruct(password)
      toast.success('All booking data deleted.', {
        description: `Triggered by ${result.deletedBy}`,
      })
      router.push('/dashboard')
      router.refresh()
    } catch (err: any) {
      toast.error('Failed to run destruct', {
        description: err?.message || 'Unknown error',
      })
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4 py-8">
      <Card className="max-w-lg w-full border-red-200 shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <ShieldAlert className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <CardTitle className="text-red-700">Destruct Switch</CardTitle>
              <CardDescription className="text-red-600">
                Permanently delete all bookings and related data. This action cannot be undone.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <p className="text-sm text-zinc-700">
                This will remove all bookings, booking PDFs, payment schedules, and booking audit history from the
                system. User accounts and system settings will be preserved.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Destruct password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter destruct password"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm">Type DELETE ALL BOOKINGS to confirm</Label>
              <Input
                id="confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE ALL BOOKINGS"
                required
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/admin')}
                disabled={isRunning}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                className="gap-2"
                disabled={isRunning}
              >
                <Trash2 className="w-4 h-4" />
                {isRunning ? 'Deleting…' : 'Delete All Bookings'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

