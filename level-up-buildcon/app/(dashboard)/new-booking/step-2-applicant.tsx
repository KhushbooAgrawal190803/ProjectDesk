'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useDraftSnapshot, type SnapshotRegistrar } from './draft-snapshot'
import { zodResolver } from '@hookform/resolvers/zod'
import { step2Schema, Step2Data, Step2FormValues } from '@/lib/validations/booking'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChevronRight, ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { DocumentUploadSection, DocumentUploadField, UploadedDoc } from './document-upload'
import { deleteDocument } from './document-actions'
import { AddressFields, AddressValue } from './address-fields'
import { formatPostalAddress } from '@/lib/booking/address'
import { normalizeAadhaar, normalizePan } from '@/lib/booking/identity'
import type { CoApplicantInput } from '@/lib/booking/persist-details'
import { ApplicantTypeSelect, RelationshipSelect } from '@/components/booking/relationship-select'
import { defaultDesignation, entityNameLabel, isIndividual } from '@/lib/booking/applicant-type'

const getErrorMessage = (error: any): string | null => {
  if (!error) return null
  return typeof error.message === 'string' ? error.message : null
}

const SALUTATIONS = ['Mr.', 'Mrs.', 'Ms.', 'Miss', 'Dr.']
const PARENTS_LABEL = "Parents' / Spouse's Name"

function SalutationSelect({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
    >
      <option value="">Select</option>
      {SALUTATIONS.map((item) => (
        <option key={item} value={item}>{item}</option>
      ))}
    </select>
  )
}

function emptyCoApplicant(): CoApplicantInput {
  return {
    id: crypto.randomUUID(),
    salutation: '',
    name: '',
    father_or_spouse: '',
    relationship: '',
    occupation: '',
    mobile: '',
    email: '',
    pan: '',
    aadhaar: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    pin_code: '',
    country: 'India',
  }
}

interface Step2ApplicantProps {
  data: Partial<Step2Data> & { coapplicants?: CoApplicantInput[] }
  onUpdate: (data: Partial<Step2Data> & { coapplicants: CoApplicantInput[] }) => void
  onNext: () => void
  onBack: () => void
  draftId?: string
  documents: Record<string, UploadedDoc>
  onDocumentsChange: (docs: Record<string, UploadedDoc>) => void
  onSnapshot?: SnapshotRegistrar
}

export function Step2Applicant({ data, onUpdate, onNext, onBack, draftId, documents, onDocumentsChange, onSnapshot }: Step2ApplicantProps) {
  const [salutation, setSalutation] = useState(data.applicant_salutation || '')
  const [address, setAddress] = useState<AddressValue>({
    address_line1: data.applicant_address_line1 || '',
    address_line2: data.applicant_address_line2 || '',
    city: data.applicant_city || '',
    state: data.applicant_state || '',
    pin_code: data.applicant_pin_code || '',
    country: data.applicant_country || 'India',
  })
  const [coapplicants, setCoapplicants] = useState<CoApplicantInput[]>(data.coapplicants || [])

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    getValues,
    formState: { errors },
  } = useForm<Step2FormValues, unknown, Step2Data>({
    resolver: zodResolver(step2Schema),
    defaultValues: { ...data, applicant_type: data.applicant_type || 'Individual', has_coapplicant: data.has_coapplicant || false },
  })
  const applicantType = watch('applicant_type') || 'Individual'
  const entity = !isIndividual(applicantType)

  const collect = (formData: Step2Data) => {
    const country = address.country || 'India'
    return {
      ...formData,
      applicant_type: entity ? applicantType : 'Individual',
      applicant_salutation: entity ? 'M/s' : salutation,
      applicant_address_line1: address.address_line1 || '',
      applicant_address_line2: address.address_line2 || '',
      applicant_city: address.city || '',
      applicant_state: address.state || '',
      applicant_pin_code: address.pin_code || '',
      applicant_country: country,
      applicant_address: formatPostalAddress({ ...address, country }),
      has_coapplicant: coapplicants.length > 0,
      coapplicants,
    }
  }

  useDraftSnapshot(onSnapshot, () => collect(getValues() as Step2Data))

  const onSubmit = (formData: Step2Data) => {
    onUpdate(collect(formData))
    onNext()
  }

  const handleError = (formErrors: any) => {
    const fieldNames = Object.keys(formErrors)
    const messages = fieldNames.map((f: string) => formErrors[f]?.message).filter(Boolean)
    toast.error('Please fix the following:', {
      description: messages.join(', ') || 'Some required fields are missing',
    })
  }

  const changeApplicantType = (next: string) => {
    const before = watch('applicant_type') || 'Individual'
    setValue('applicant_type', next)
    // Suggest the usual title of the signatory (Karta for an HUF, Partner for a firm…) unless one was typed.
    const designation = (watch('applicant_representative_designation') || '').trim()
    if (!isIndividual(next) && (!designation || designation === defaultDesignation(before))) {
      setValue('applicant_representative_designation', defaultDesignation(next))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, handleError)} className="space-y-6">
      {/* Applicant Information */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Primary Applicant</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="applicant_type">Applicant type</Label>
            <div className="md:max-w-sm">
              <ApplicantTypeSelect id="applicant_type" value={applicantType} onChange={changeApplicantType} />
            </div>
            {entity && (
              <p className="text-xs text-zinc-500">
                Booked in the name of the {applicantType.trim() || 'entity'} (printed as M/s) and signed by its representative below. PAN is the {applicantType.trim() || 'entity'}&apos;s; Aadhaar and mobile are the representative&apos;s.
              </p>
            )}
          </div>
          {!entity && (
            <div className="space-y-2">
              <Label htmlFor="applicant_salutation">Salutation</Label>
              <SalutationSelect id="applicant_salutation" value={salutation} onChange={setSalutation} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="applicant_name">{entity ? entityNameLabel(applicantType) : 'Full Name'}</Label>
            <Input
              id="applicant_name"
              {...register('applicant_name')}
              placeholder={entity ? 'e.g. Sharma Family HUF' : 'Enter full name'}
            />
            {errors.applicant_name && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.applicant_name)}</p>
            )}
          </div>

          {entity ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="applicant_representative">Represented by</Label>
                <Input id="applicant_representative" {...register('applicant_representative')} placeholder="e.g. Mr. Ramesh Sharma" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="applicant_representative_designation">Representative&apos;s designation</Label>
                <Input
                  id="applicant_representative_designation"
                  {...register('applicant_representative_designation')}
                  placeholder={defaultDesignation(applicantType)}
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="applicant_father_or_spouse">{PARENTS_LABEL}</Label>
                <Input
                  id="applicant_father_or_spouse"
                  {...register('applicant_father_or_spouse')}
                  placeholder="Enter name"
                />
                {errors.applicant_father_or_spouse && (
                  <p className="text-sm text-red-600">{getErrorMessage(errors.applicant_father_or_spouse)}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="applicant_relationship">Relationship of the person named above</Label>
                <RelationshipSelect
                  id="applicant_relationship"
                  value={watch('applicant_relationship')}
                  onChange={(value) => setValue('applicant_relationship', value)}
                />
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label htmlFor="applicant_occupation">{entity ? 'Nature of business' : 'Occupation'}</Label>
            <Input id="applicant_occupation" {...register('applicant_occupation')} placeholder={entity ? 'e.g. Trading, Investment' : 'Occupation'} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="applicant_mobile">{entity ? "Representative's Mobile Number" : 'Mobile Number'}</Label>
            <Input
              id="applicant_mobile"
              {...register('applicant_mobile')}
              placeholder="10-digit mobile number"
              maxLength={10}
            />
            {errors.applicant_mobile && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.applicant_mobile)}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="applicant_email">Email Address</Label>
            <Input
              id="applicant_email"
              type="email"
              {...register('applicant_email')}
              placeholder="email@example.com"
            />
            {errors.applicant_email && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.applicant_email)}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="applicant_pan">{entity ? `PAN of the ${applicantType.trim() || 'entity'}` : 'PAN Number'}</Label>
            <Input
              id="applicant_pan"
              value={watch('applicant_pan') || ''}
              placeholder="ABCDE1234F"
              maxLength={10}
              onChange={(event) => setValue('applicant_pan', normalizePan(event.target.value))}
              style={{ textTransform: 'uppercase' }}
            />
            {errors.applicant_pan && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.applicant_pan)}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="applicant_aadhaar">{entity ? "Representative's Aadhaar Number" : 'Aadhaar Number'}</Label>
            <Input
              id="applicant_aadhaar"
              value={watch('applicant_aadhaar') || ''}
              placeholder="12-digit Aadhaar"
              maxLength={12}
              inputMode="numeric"
              onChange={(event) => setValue('applicant_aadhaar', normalizeAadhaar(event.target.value))}
            />
            {errors.applicant_aadhaar && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.applicant_aadhaar)}</p>
            )}
          </div>

          <AddressFields idPrefix="applicant" value={address} onChange={setAddress} />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Co-Applicants</h3>
          <Button type="button" variant="outline" onClick={() => setCoapplicants((current) => [...current, emptyCoApplicant()])} className="gap-2">
            <Plus className="size-4" />
            Add Co-Applicant
          </Button>
        </div>
        {coapplicants.map((person, index) => (
          <div key={person.id} className="space-y-4 rounded-lg border border-zinc-200 p-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-zinc-900">Co-Applicant {index + 1}</h4>
              <Button
                type="button"
                variant="ghost"
                className="text-red-600"
                onClick={() => {
                  const pan = documents[`${person.id}:pan`]
                  const aadhaar = documents[`${person.id}:aadhaar`]
                  if (pan) void deleteDocument(pan.id)
                  if (aadhaar) void deleteDocument(aadhaar.id)
                  const next = { ...documents }
                  delete next[`${person.id}:pan`]
                  delete next[`${person.id}:aadhaar`]
                  onDocumentsChange(next)
                  setCoapplicants((current) => current.filter((item) => item.id !== person.id))
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Salutation</Label>
                <SalutationSelect
                  id={`${person.id}-salutation`}
                  value={person.salutation || ''}
                  onChange={(value) => setCoapplicants((current) => current.map((item) => item.id === person.id ? { ...item, salutation: value } : item))}
                />
              </div>
              <div className="space-y-2">
                <Label>Relationship</Label>
                <RelationshipSelect
                  id={`${person.id}-relationship`}
                  value={person.relationship}
                  onChange={(value) => setCoapplicants((current) => current.map((item) => item.id === person.id ? { ...item, relationship: value } : item))}
                />
              </div>
              {([
                ['name', 'Full Name'],
                ['father_or_spouse', PARENTS_LABEL],
                ['occupation', 'Occupation'],
                ['mobile', 'Mobile Number'],
                ['email', 'Email'],
                ['pan', 'PAN'],
                ['aadhaar', 'Aadhaar'],
              ] as const).map(([key, label]) => (
                <div key={key} className="space-y-2">
                  <Label>{label}</Label>
                  <Input
                    value={person[key] || ''}
                    inputMode={key === 'aadhaar' ? 'numeric' : undefined}
                    maxLength={key === 'pan' ? 10 : key === 'aadhaar' ? 12 : undefined}
                    onChange={(e) => {
                      const raw = e.target.value
                      const next = key === 'pan' ? normalizePan(raw) : key === 'aadhaar' ? normalizeAadhaar(raw) : raw
                      setCoapplicants((current) => current.map((item) => item.id === person.id ? { ...item, [key]: next } : item))
                    }}
                  />
                </div>
              ))}
              <AddressFields
                idPrefix={person.id}
                value={person}
                onChange={(next) => setCoapplicants((current) => current.map((item) => item.id === person.id ? { ...item, ...next } : item))}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DocumentUploadField
                label="PAN Card (Image/PDF)"
                documentType="coapplicant_pan"
                recordKey={`${person.id}:pan`}
                bookingId={draftId}
                uploadedDoc={documents[`${person.id}:pan`]}
                onUpload={(doc, recordKey) => onDocumentsChange({ ...documents, [recordKey]: doc })}
                onRemove={(recordKey) => {
                  const next = { ...documents }
                  delete next[recordKey]
                  onDocumentsChange(next)
                }}
              />
              <DocumentUploadField
                label="Aadhaar Card (Image/PDF)"
                documentType="coapplicant_aadhaar"
                recordKey={`${person.id}:aadhaar`}
                bookingId={draftId}
                uploadedDoc={documents[`${person.id}:aadhaar`]}
                onUpload={(doc, recordKey) => onDocumentsChange({ ...documents, [recordKey]: doc })}
                onRemove={(recordKey) => {
                  const next = { ...documents }
                  delete next[recordKey]
                  onDocumentsChange(next)
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <DocumentUploadSection
        showCoApplicant={false}
        bookingId={draftId}
        documents={documents}
        onDocumentsChange={onDocumentsChange}
      />

      {/* Actions */}
      <div className="flex justify-between pt-4 border-t border-zinc-200">
        <Button type="button" variant="outline" onClick={onBack} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          Back
        </Button>
        <Button type="submit" className="gap-2">
          Continue
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </form>
  )
}

