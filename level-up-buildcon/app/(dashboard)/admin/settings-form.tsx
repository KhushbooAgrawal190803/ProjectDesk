'use client'

import { useState } from 'react'
import { Settings } from '@/lib/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { updateSettings } from './actions'

interface SettingsFormProps {
  settings: Settings
}

export function SettingsForm({ settings }: SettingsFormProps) {
  const [loading, setLoading] = useState(false)
  const [allowSelfSignup, setAllowSelfSignup] = useState(settings.allow_self_signup)
  const [serialPrefix, setSerialPrefix] = useState(settings.serial_prefix)
  const [defaultLocation, setDefaultLocation] = useState(settings.default_project_location)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      await updateSettings({
        allow_self_signup: allowSelfSignup,
        serial_prefix: serialPrefix,
        default_project_location: defaultLocation,
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
        <div className="flex items-center justify-between p-4 border border-zinc-200 rounded-lg">
          <div className="space-y-0.5">
            <Label htmlFor="selfSignup" className="text-base">
              Allow Self-Signup
            </Label>
            <p className="text-sm text-zinc-500">
              Allow users to create accounts without admin approval
            </p>
          </div>
          <Switch
            id="selfSignup"
            checked={allowSelfSignup}
            onCheckedChange={setAllowSelfSignup}
            disabled={loading}
          />
        </div>

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
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? 'Saving...' : 'Save Changes'}
      </Button>
    </form>
  )
}

