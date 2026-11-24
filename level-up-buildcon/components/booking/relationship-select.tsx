'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { isPresetRelationship, PRESET_RELATIONSHIPS } from '@/lib/booking/relationship'

const SELECT_CLASS =
  'flex h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900'

/**
 * Father / Mother / Husband / Wife, or Other with the relation typed in.
 * The stored value is the preset or the typed text, so documents can print it as entered.
 */
export function RelationshipSelect({
  id,
  value,
  onChange,
  className,
}: {
  id?: string
  value: string | null | undefined
  onChange: (value: string) => void
  className?: string
}) {
  const current = (value || '').trim()
  const [other, setOther] = useState(Boolean(current) && !isPresetRelationship(current))

  return (
    <div className="space-y-2">
      <select
        id={id}
        value={other ? 'Other' : current}
        onChange={(event) => {
          const choice = event.target.value
          if (choice === 'Other') {
            setOther(true)
            onChange(isPresetRelationship(current) ? '' : current)
          } else {
            setOther(false)
            onChange(choice)
          }
        }}
        className={className || SELECT_CLASS}
      >
        <option value="">Select</option>
        {PRESET_RELATIONSHIPS.map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
        <option value="Other">Other</option>
      </select>
      {other && (
        <Input
          id={id ? `${id}_other` : undefined}
          value={value || ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Relation, e.g. Guardian, Grandfather, Brother"
          aria-label="Other relation"
          autoFocus
        />
      )}
    </div>
  )
}
