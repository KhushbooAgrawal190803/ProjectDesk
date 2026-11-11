'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatPostalAddress, PostalAddressInput } from '@/lib/booking/address'

export interface AddressValue extends PostalAddressInput {}

export function AddressFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string
  value: AddressValue
  onChange: (next: AddressValue) => void
}) {
  const set = (key: keyof AddressValue, next: string) => onChange({ ...value, [key]: next })
  const formatted = formatPostalAddress({ ...value, country: value.country || 'India' })

  return (
    <div className="space-y-4 md:col-span-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`${idPrefix}-line1`}>Address Line 1</Label>
          <Input id={`${idPrefix}-line1`} value={value.address_line1 || ''} onChange={(e) => set('address_line1', e.target.value)} placeholder="House / flat, street" />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`${idPrefix}-line2`}>Address Line 2 <span className="font-normal text-zinc-400">(optional)</span></Label>
          <Input id={`${idPrefix}-line2`} value={value.address_line2 || ''} onChange={(e) => set('address_line2', e.target.value)} placeholder="Area, landmark" />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-city`}>City</Label>
          <Input id={`${idPrefix}-city`} value={value.city || ''} onChange={(e) => set('city', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-state`}>State</Label>
          <Input id={`${idPrefix}-state`} value={value.state || ''} onChange={(e) => set('state', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-pin`}>PIN Code</Label>
          <Input id={`${idPrefix}-pin`} value={value.pin_code || ''} onChange={(e) => set('pin_code', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-country`}>Country</Label>
          <Input id={`${idPrefix}-country`} value={value.country || 'India'} onChange={(e) => set('country', e.target.value)} />
        </div>
      </div>
      {formatted && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
          <p className="text-xs font-medium text-zinc-500">Formatted address</p>
          <p className="mt-1 whitespace-pre-line text-sm text-zinc-800">{formatted}</p>
        </div>
      )}
    </div>
  )
}
