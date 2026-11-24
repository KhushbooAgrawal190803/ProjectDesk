'use client'

import { useMemo, useState } from 'react'
import { useDraftSnapshot, type SnapshotRegistrar } from './draft-snapshot'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AmountInput } from '@/components/ui/amount-input'
import { DateField } from '@/components/ui/date-field'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { considerationOf } from '@/lib/booking/consideration'
import { formatInr, percentOfPaise } from '@/lib/booking/money'
import { resolveSchedule, standardScheduleRows, type ScheduleRowInput } from '@/lib/booking/schedule'
import { CONSTRUCTION_MILESTONES } from '@/lib/demands/milestones'

interface StepPaymentScheduleProps {
  data: {
    pricing_mode?: 'rate' | 'lump_sum' | null
    super_builtup_area?: number | string | null
    rate_per_sqft?: number | string | null
    total_cost?: number | string | null
    total_parking_charges?: number | string | null
    parking_spaces?: Array<{ price?: unknown }>
    schedule_mode?: 'standard' | 'custom'
    schedule_rows?: ScheduleRowInput[]
  }
  onUpdate: (data: { schedule_mode: 'standard' | 'custom'; schedule_rows: ScheduleRowInput[]; payment_plan_type: 'ConstructionLinked' | 'Custom' }) => void
  onNext: () => void
  onBack: () => void
  onSnapshot?: SnapshotRegistrar
}

function emptyRow(): ScheduleRowInput {
  return {
    id: crypto.randomUUID(),
    trigger_type: 'milestone',
    label: '',
    milestone_code: '',
    calc_type: 'percentage',
    value: '',
  }
}

export function StepPaymentSchedule({ data, onUpdate, onNext, onBack, onSnapshot }: StepPaymentScheduleProps) {
  const priced = considerationOf(data)
  const [mode, setMode] = useState<'standard' | 'custom'>(data.schedule_mode === 'custom' ? 'custom' : 'standard')
  const [rows, setRows] = useState<ScheduleRowInput[]>(data.schedule_mode === 'custom' ? (data.schedule_rows || []) : [])

  const activeRows = mode === 'standard' ? standardScheduleRows() : rows
  const resolved = useMemo(
    () => (priced == null ? null : resolveSchedule(priced.totalPaise, activeRows)),
    [priced, activeRows]
  )

  const switchMode = (next: 'standard' | 'custom') => {
    setMode(next)
  }

  const updateRow = (index: number, patch: Partial<ScheduleRowInput>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const collect = () => ({
    schedule_mode: mode,
    schedule_rows: activeRows,
    payment_plan_type: mode === 'custom' ? ('Custom' as const) : ('ConstructionLinked' as const),
  })

  useDraftSnapshot(onSnapshot, collect)

  const continueNext = () => {
    onUpdate(collect())
    onNext()
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
        <p>Flat: <span className="font-semibold">{priced == null ? '—' : `${formatInr(priced.flatPaise)} · GST ${formatInr(percentOfPaise(priced.flatPaise, 5) ?? 0n)}`}</span>
          {' · '}Parking: <span className="font-semibold">{priced == null ? '—' : formatInr(priced.parkingPaise)}</span>
          {' · '}Total Consideration: <span className="font-semibold">{priced == null ? '—' : `${formatInr(priced.totalPaise)} · GST ${formatInr(percentOfPaise(priced.totalPaise, 5) ?? 0n)}`}</span></p>
        <p className="mt-1 text-xs text-zinc-500">Each percentage is of Total Consideration (flat + parking). Parking is not a separate installment. GST is charged separately.</p>
      </div>

      <div className="flex gap-2">
        <Button type="button" variant={mode === 'standard' ? 'default' : 'outline'} onClick={() => switchMode('standard')}>
          Standard schedule
        </Button>
        <Button type="button" variant={mode === 'custom' ? 'default' : 'outline'} onClick={() => switchMode('custom')}>
          Custom schedule
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-2 pr-3 font-medium">Trigger</th>
              <th className="py-2 pr-3 font-medium">Milestone or date</th>
              <th className="py-2 pr-3 font-medium">Type</th>
              <th className="py-2 pr-3 font-medium">Value</th>
              <th className="py-2 pr-3 font-medium text-right">Amount</th>
              {mode === 'custom' && <th className="py-2" />}
            </tr>
          </thead>
          <tbody>
            {(mode === 'standard' ? standardScheduleRows() : rows).map((row, index) => {
              const amount = resolved?.rows[index]?.calculated_amount
              return (
                <tr key={row.id || index} className="border-b border-zinc-100">
                  <td className="py-2 pr-3">
                    {mode === 'custom' ? (
                      <select
                        value={row.trigger_type}
                        onChange={(e) => updateRow(index, { trigger_type: e.target.value as ScheduleRowInput['trigger_type'] })}
                        className="h-10 rounded-lg border border-zinc-200 bg-white px-2 text-sm"
                      >
                        <option value="milestone">Construction slab</option>
                        <option value="date">Date</option>
                      </select>
                    ) : (
                      <span>Construction slab</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {mode === 'custom' ? (
                      row.trigger_type === 'date' ? (
                        <DateField value={row.milestone_date || ''} onChange={(value) => updateRow(index, { milestone_date: value, label: value })} />
                      ) : (
                        <select
                          value={row.milestone_code || ''}
                          onChange={(e) => {
                            const code = e.target.value
                            const milestone = CONSTRUCTION_MILESTONES.find((item) => item.code === code)
                            updateRow(index, { milestone_code: code, label: milestone?.label || '' })
                          }}
                          className="h-10 max-w-xs rounded-lg border border-zinc-200 bg-white px-2 text-sm"
                        >
                          <option value="">{row.label && !row.milestone_code ? row.label : 'Select milestone'}</option>
                          {CONSTRUCTION_MILESTONES.map((milestone) => (
                            <option key={milestone.code} value={milestone.code}>{milestone.label}</option>
                          ))}
                        </select>
                      )
                    ) : (
                      <span>{row.label}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {mode === 'custom' ? (
                      <select
                        value={row.calc_type}
                        onChange={(e) => updateRow(index, { calc_type: e.target.value as ScheduleRowInput['calc_type'] })}
                        className="h-10 rounded-lg border border-zinc-200 bg-white px-2 text-sm"
                      >
                        <option value="percentage">Percentage</option>
                        <option value="fixed">Fixed amount</option>
                      </select>
                    ) : (
                      <span>Percentage</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {mode === 'custom' && row.calc_type !== 'percentage' ? (
                      <AmountInput value={row.value as string | number | undefined} onValueChange={(value) => updateRow(index, { value })} placeholder="₹" />
                    ) : mode === 'custom' ? (
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.value ?? ''}
                        onChange={(e) => updateRow(index, { value: e.target.value })}
                        placeholder="%"
                      />
                    ) : (
                      <span>{row.value}%</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right font-medium">{amount ? formatInr(amount) : '—'}</td>
                  {mode === 'custom' && (
                    <td className="py-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setRows((current) => current.filter((_, i) => i !== index))} className="text-red-600">
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {mode === 'custom' && (
        <div className="space-y-3">
          {rows.length === 0 && (
            <p className="text-sm text-zinc-500">No rows yet. Add each payment as its own row.</p>
          )}
          <Button type="button" variant="outline" onClick={() => setRows((current) => [...current, emptyRow()])} className="gap-2">
            <Plus className="size-4" />
            Add Row
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-6 text-sm">
        <p>Running total: <span className="font-semibold">{resolved ? formatInr(resolved.totalPaise) : '—'}</span></p>
        <p>Remaining: <span className="font-semibold">{priced != null && resolved ? formatInr(priced.totalPaise - resolved.totalPaise) : '—'}</span></p>
      </div>

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
