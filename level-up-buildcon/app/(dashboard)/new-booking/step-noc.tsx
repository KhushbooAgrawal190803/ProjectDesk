'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateField } from '@/components/ui/date-field'
import { Label } from '@/components/ui/label'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AddressFields, AddressValue } from './address-fields'
import { formatPostalAddress } from '@/lib/booking/address'

interface StepNocProps {
  data: {
    noc_required?: boolean
    noc_bank_name?: string
    noc_addressee?: string
    noc_bank_address?: string
    noc_bank_address_line1?: string
    noc_bank_address_line2?: string
    noc_bank_city?: string
    noc_bank_state?: string
    noc_bank_pin_code?: string
    noc_bank_country?: string
    agreement_for_sale_date?: string
  }
  onUpdate: (data: StepNocProps['data']) => void
  onNext: () => void
  onBack: () => void
}

export function StepNoc({ data, onUpdate, onNext, onBack }: StepNocProps) {
  const [required, setRequired] = useState(Boolean(data.noc_required))
  const [bankName, setBankName] = useState(data.noc_bank_name || '')
  const [addressee, setAddressee] = useState(data.noc_addressee || '')
  const [agreementDate, setAgreementDate] = useState((data.agreement_for_sale_date || '').slice(0, 10))
  const [address, setAddress] = useState<AddressValue>({
    address_line1: data.noc_bank_address_line1 || '',
    address_line2: data.noc_bank_address_line2 || '',
    city: data.noc_bank_city || '',
    state: data.noc_bank_state || '',
    pin_code: data.noc_bank_pin_code || '',
    country: data.noc_bank_country || 'India',
  })

  const continueNext = () => {
    const country = address.country || 'India'
    onUpdate({
      agreement_for_sale_date: agreementDate,
      noc_required: required,
      noc_bank_name: required ? bankName.trim() : '',
      noc_addressee: required ? addressee.trim() : '',
      noc_bank_address_line1: required ? address.address_line1 || '' : '',
      noc_bank_address_line2: required ? address.address_line2 || '' : '',
      noc_bank_city: required ? address.city || '' : '',
      noc_bank_state: required ? address.state || '' : '',
      noc_bank_pin_code: required ? address.pin_code || '' : '',
      noc_bank_country: required ? country : '',
      noc_bank_address: required ? formatPostalAddress({ ...address, country }) : '',
    })
    onNext()
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Is a Bank NOC required?</h3>
        <div className="flex gap-2 max-w-md">
          {([false, true] as const).map((value) => (
            <label key={String(value)} className="flex-1">
              <input type="radio" className="peer sr-only" checked={required === value} onChange={() => setRequired(value)} />
              <div className="flex h-11 items-center justify-center rounded-lg border-2 border-zinc-200 cursor-pointer peer-checked:border-zinc-900 peer-checked:bg-zinc-50">
                <span className="font-medium">{value ? 'Yes' : 'No'}</span>
              </div>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-zinc-500">Defaults to No. These details are used only when a NOC letter is needed.</p>
      </div>

      {required && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="noc_bank_name">Bank Name</Label>
            <Input id="noc_bank_name" value={bankName} onChange={(e) => setBankName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="noc_addressee">Addressee</Label>
            <Input id="noc_addressee" value={addressee} onChange={(e) => setAddressee(e.target.value)} placeholder="Person or designation" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agreement_for_sale_date">Agreement for Sale Date</Label>
            <DateField id="agreement_for_sale_date" value={agreementDate} onChange={setAgreementDate} />
            <p className="text-xs text-zinc-500">Taken from the agreement. It is not filled from the allotment date.</p>
          </div>
          <AddressFields idPrefix="noc-bank" value={address} onChange={setAddress} />
        </div>
      )}

      <div className="flex justify-between pt-4 border-t border-zinc-200">
        <Button type="button" variant="outline" onClick={onBack} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          Back
        </Button>
        <Button type="button" onClick={continueNext} className="gap-2">
          Continue
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
