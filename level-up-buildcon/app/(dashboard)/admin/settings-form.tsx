'use client'

import { useState } from 'react'
import { Settings } from '@/lib/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { updateSettings } from './actions'

interface SettingsFormProps {
  settings: Settings
}

export function SettingsForm({ settings }: SettingsFormProps) {
  const [loading, setLoading] = useState(false)
  const [serialPrefix, setSerialPrefix] = useState(settings.serial_prefix)
  const [defaultLocation, setDefaultLocation] = useState(settings.default_project_location)
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState(settings.forgot_password_email || 'agkhushboo43@gmail.com')

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      await updateSettings({
        serial_prefix: serialPrefix,
        default_project_location: defaultLocation,
        forgot_password_email: forgotPasswordEmail,
      })
      toast.success('Settings updated successfully')
    } catch (error) {
      toast.error('Failed to update settings')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="serialPrefix">Serial Number Prefix</Label>
          <Input
            id="serialPrefix"
            value={serialPrefix}
            onChange={(e) => setSerialPrefix(e.target.value)}
            placeholder="LUBC-"
            required
            disabled={loading}
            className="max-w-xs"
          />
          <p className="text-sm text-zinc-500">
            Prefix for booking serial numbers (e.g., LUBC-000001)
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="defaultLocation">Default Project Location</Label>
          <Input
            id="defaultLocation"
            value={defaultLocation}
            onChange={(e) => setDefaultLocation(e.target.value)}
            placeholder="Ranchi, Jharkhand"
            required
            disabled={loading}
          />
          <p className="text-sm text-zinc-500">
            Default location for new bookings
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="forgotPasswordEmail">Forgot Password Notification Email</Label>
          <Input
            id="forgotPasswordEmail"
            type="email"
            value={forgotPasswordEmail}
            onChange={(e) => setForgotPasswordEmail(e.target.value)}
            placeholder="admin@company.com"
            required
            disabled={loading}
          />
          <p className="text-sm text-zinc-500">
            Password reset requests from users will be sent to this email address
          </p>
        </div>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? 'Saving...' : 'Save Changes'}
      </Button>
    </form>
  )
}

