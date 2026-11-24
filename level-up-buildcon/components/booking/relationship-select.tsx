'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { PRESET_RELATIONSHIPS } from '@/lib/booking/relationship'
import { APPLICANT_TYPES } from '@/lib/booking/applicant-type'

const SELECT_CLASS =
  'flex h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900'

/**
 * A list of usual answers plus Other, which opens a box to type the answer.
 * The stored value is the chosen option or the typed text, so documents print it as entered.
 */
export function ChoiceWithOther({
  id,
  value,
  onChange,
  options,
  otherPlaceholder,
  otherLabel,
  emptyLabel = 'Select',
}: {
  id?: string
  value: string | null | undefined
  onChange: (value: string) => void
  options: readonly string[]
  otherPlaceholder: string
  otherLabel: string
  /** Shown for an empty value; null when a value is always chosen. */
  emptyLabel?: string | null
}) {
  const current = (value || '').trim()
  const isOption = (text: string) => options.includes(text)
  const [other, setOther] = useState(Boolean(current) && !isOption(current))

  return (
    <div className="space-y-2">
      <select
        id={id}
        value={other ? '__other' : current}
        onChange={(event) => {
          const choice = event.target.value
          if (choice === '__other') {
            setOther(true)
            onChange(isOption(current) ? '' : current)
          } else {
            setOther(false)
            onChange(choice)
          }
        }}
        className={SELECT_CLASS}
      >
        {emptyLabel != null && <option value="">{emptyLabel}</option>}
        {options.map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
        <option value="__other">Other</option>
      </select>
      {other && (
        <Input
          id={id ? `${id}_other` : undefined}
          value={value || ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={otherPlaceholder}
          aria-label={otherLabel}
          autoFocus
        />
      )}
    </div>
  )
}

/** Father / Mother / Husband / Wife, or Other with the relation typed in. */
export function RelationshipSelect({ id, value, onChange }: { id?: string; value: string | null | undefined; onChange: (value: string) => void }) {
  return (
    <ChoiceWithOther
      id={id}
      value={value}
      onChange={onChange}
      options={PRESET_RELATIONSHIPS}
      otherPlaceholder="Relation, e.g. Guardian, Grandfather, Brother"
      otherLabel="Other relation"
    />
  )
}

/** Individual, HUF, Company, Partnership Firm, Trust / Society, or Other typed in. */
export function ApplicantTypeSelect({ id, value, onChange }: { id?: string; value: string | null | undefined; onChange: (value: string) => void }) {
  return (
    <ChoiceWithOther
      id={id}
      value={value || 'Individual'}
      onChange={onChange}
      options={APPLICANT_TYPES}
      otherPlaceholder="Kind of applicant, e.g. Society, LLP, Association"
      otherLabel="Other applicant type"
      emptyLabel={null}
    />
  )
}
