'use client'

import { useState, useCallback, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { step1Schema, Step1Data, Step1FormValues } from '@/lib/validations/booking'
import { getFlatAreas, isFlatAreaLookupProject, isCommercialFlat, isAmenityFlat, COMMERCIAL_FLAT_AREA } from '@/lib/data/flat-areas'
import { getUndividedLandShare } from '@/lib/data/land-share'
import { getOwnerNameForFlat } from '@/lib/data/flat-ownership'
import { boundaryMatch, getUnitBoundaries } from '@/lib/data/flat-boundaries'
import { checkUnitAvailability } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateField } from '@/components/ui/date-field'
import { Label } from '@/components/ui/label'
import { ChevronRight, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

const getErrorMessage = (error: unknown): string | null => {
  if (!error) return null
  return typeof (error as { message?: unknown }).message === 'string' ? String((error as { message: string }).message) : null
}

interface Step1ProjectUnitProps {
  data: Partial<Step1Data>
  onUpdate: (data: Partial<Step1Data>) => void
  onNext: () => void
  draftId?: string
}

export function Step1ProjectUnit({ data, onUpdate, onNext, draftId }: Step1ProjectUnitProps) {
  const [unitWarning, setUnitWarning] = useState<string | null>(null)
  const [flatError, setFlatError] = useState<string | null>(null)
  const [unitSizeLabel, setUnitSizeLabel] = useState<string | null>(null)
  const [checkingUnit, setCheckingUnit] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<Step1FormValues, unknown, Step1Data>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      project_name: 'Anandam',
      project_location: 'Ranchi, Jharkhand',
      project_address: 'PLOT NO 1089 KHATA NO 74, GUTUWA NAGRI RANCHI JHARKHAND',
      rera_regn_no: 'JHARERA/PROJECT/15/2026',
      building_permit_no: 'RRDA/GH/0369/2025',
      ...data,
    },
  })

  const unitCategory = watch('unit_category')
  const projectName = watch('project_name')
  const unitNo = watch('unit_no')
  const boundaryState = boundaryMatch(unitNo)
  const boundaries = getUnitBoundaries(unitNo)

  useEffect(() => {
    if (unitCategory) setValue('unit_type', 'Flat')
  }, [unitCategory, setValue])

  useEffect(() => {
    if (!projectName || !unitNo) return
    const trimmed = unitNo.trim()
    if (unitCategory === 'Commercial' && isCommercialFlat(trimmed)) {
      setValue('builtup_area', COMMERCIAL_FLAT_AREA.built_up_area_sqft!)
      setValue('super_builtup_area', COMMERCIAL_FLAT_AREA.super_built_up_area_sqft!)
      return
    }
    const areas = getFlatAreas(projectName, trimmed)
    if (areas) {
      if (areas.built_up_area_sqft != null) setValue('builtup_area', areas.built_up_area_sqft)
      if (areas.super_built_up_area_sqft != null) setValue('super_builtup_area', areas.super_built_up_area_sqft)
    }
  }, [projectName, unitNo, unitCategory, setValue])

  useEffect(() => {
    if (!unitNo) return
    const digits = unitNo.replace(/\D/g, '')
    if (digits.length >= 3) {
      setValue('floor_no', digits.slice(0, -2))
    }
  }, [unitNo, setValue])

  useEffect(() => {
    setValue('boundary_east', boundaries?.east || '')
    setValue('boundary_west', boundaries?.west || '')
    setValue('boundary_north', boundaries?.north || '')
    setValue('boundary_south', boundaries?.south || '')
  }, [boundaries, setValue])

  useEffect(() => {
    if (!unitNo || unitCategory !== 'Residential') {
      setUnitSizeLabel(null)
      return
    }
    const trimmed = unitNo.trim()
    const lastChar = trimmed[trimmed.length - 1]
    if (lastChar === '4' || lastChar === '8') {
      setUnitSizeLabel('4 BHK')
    } else {
      setUnitSizeLabel('3 BHK')
    }
  }, [unitNo, unitCategory])

  const ownerName = getOwnerNameForFlat(unitNo) || null

  useEffect(() => {
    if (!projectName || !unitNo) { setFlatError(null); return }
    if (!isFlatAreaLookupProject(projectName)) { setFlatError(null); return }
    const trimmed = unitNo.trim()

    if (isCommercialFlat(trimmed)) {
      setFlatError(`Flat ${unitNo} is sold and is not available for booking.`)
    } else if (unitCategory === 'Commercial') {
      setFlatError('Commercial units 101–104 and 201–204 are sold.')
    } else if (isAmenityFlat(trimmed)) {
      setFlatError(`Flat ${unitNo} is an amenity unit and is not available for booking`)
    } else {
      const areas = getFlatAreas(projectName, trimmed)
      setFlatError(areas === null ? `Flat ${unitNo} is not in the Anandam schedule` : null)
    }
  }, [projectName, unitNo, unitCategory])

  const checkUnit = useCallback(async () => {
    if (!projectName || !unitNo) {
      setUnitWarning(null)
      return
    }
    setCheckingUnit(true)
    try {
      const result = await checkUnitAvailability(projectName, unitNo, draftId)
      if (!result.available) {
        setUnitWarning(result.message || 'This unit is already booked')
      } else {
        setUnitWarning(null)
      }
    } catch {
      setUnitWarning(null)
    } finally {
      setCheckingUnit(false)
    }
  }, [projectName, unitNo, draftId])

  const onSubmit = (formData: Step1Data) => {
    if (flatError) {
      toast.error('Invalid flat number', { description: flatError })
      return
    }
    if (unitWarning) {
      toast.error('Unit not available', { description: unitWarning })
      return
    }
    onUpdate(formData)
    onNext()
  }

  const handleError = (formErrors: Record<string, { message?: string } | undefined>) => {
    const messages = Object.values(formErrors).map((e) => e?.message).filter(Boolean)
    toast.error('Please fix the following:', {
      description: messages.join(', ') || 'Some required fields are missing',
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, handleError)} className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Project Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="project_name">Project Name</Label>
            <Input id="project_name" {...register('project_name')} placeholder="Enter project name" />
            {errors.project_name && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.project_name)}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="project_location">Location</Label>
            <Input id="project_location" {...register('project_location')} placeholder="City, State" />
            {errors.project_location && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.project_location)}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="rera_regn_no">RERA Registration No.</Label>
            <Input id="rera_regn_no" {...register('rera_regn_no')} placeholder="Optional" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="building_permit_no">Building Permit No.</Label>
            <Input id="building_permit_no" {...register('building_permit_no')} placeholder="Optional" />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="project_address">Project Address</Label>
            <Input id="project_address" {...register('project_address')} placeholder="Full project address" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="allotment_date">Allotment Date</Label>
            <DateField id="allotment_date" value={watch('allotment_date') || ''} onChange={(value) => setValue('allotment_date', value)} />
            <p className="text-xs text-zinc-500">Printed on the allotment letter and the NOC. This is not the Agreement for Sale date.</p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Unit Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="unit_category">Unit Category</Label>
            <div className="flex gap-2">
              <label className="flex-1">
                <input type="radio" value="Residential" {...register('unit_category')} className="peer sr-only" />
                <div className="flex items-center justify-center h-11 px-4 border-2 border-zinc-200 rounded-lg cursor-pointer peer-checked:border-zinc-900 peer-checked:bg-zinc-50 transition-all">
                  <span className="font-medium">Residential</span>
                </div>
              </label>
              <label className="flex-1">
                <input type="radio" value="Commercial" {...register('unit_category')} className="peer sr-only" />
                <div className="flex items-center justify-center h-11 px-4 border-2 border-zinc-200 rounded-lg cursor-pointer peer-checked:border-zinc-900 peer-checked:bg-zinc-50 transition-all">
                  <span className="font-medium">Commercial</span>
                </div>
              </label>
            </div>
          </div>

          <input type="hidden" {...register('unit_type')} />

          <div className="space-y-2">
            <Label htmlFor="unit_no">Unit Number</Label>
            <Input
              id="unit_no"
              {...register('unit_no')}
              placeholder="e.g., 101"
              onBlur={checkUnit}
              className={unitWarning ? 'border-amber-500 focus:ring-amber-500' : ''}
            />
            {unitSizeLabel && !flatError && (
              <p className="text-sm text-zinc-600">
                Unit size:&nbsp;
                <span className="font-medium">{unitSizeLabel}</span>
              </p>
            )}
            {ownerName && !flatError && (
              <p className="text-sm text-zinc-600">
                Owner:&nbsp;
                <span className="font-medium">{ownerName}</span>
              </p>
            )}
            {errors.unit_no && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.unit_no)}</p>
            )}
            {flatError && !errors.unit_no && (
              <p className="text-sm text-red-600 font-medium">{flatError}</p>
            )}
            {checkingUnit && (
              <p className="text-sm text-zinc-500">Checking availability...</p>
            )}
            {unitWarning && !errors.unit_no && !flatError && (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-700">{unitWarning}</p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="floor_no">Floor Number</Label>
            <Input id="floor_no" {...register('floor_no')} placeholder="Auto-filled from unit no." className="bg-zinc-50" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="builtup_area">Built-up Area (sq.ft.)</Label>
            <Input id="builtup_area" type="number" step="0.01" {...register('builtup_area')} placeholder="Auto-filled for Anandam" />
            {errors.builtup_area && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.builtup_area)}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="super_builtup_area">Super Built-up Area (sq.ft.)</Label>
            <Input id="super_builtup_area" type="number" step="0.01" {...register('super_builtup_area')} placeholder="Auto-filled for Anandam" />
            {errors.super_builtup_area && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.super_builtup_area)}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="undivided_land_share">Undivided land share (sq.ft.)</Label>
            <Input
              id="undivided_land_share"
              readOnly
              value={getUndividedLandShare(projectName, unitNo) ?? ''}
              placeholder="Fills in from the land share schedule"
              className="bg-zinc-50"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Boundaries</h3>
        {boundaries ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {([
              ['boundary_east', 'East'],
              ['boundary_west', 'West'],
              ['boundary_north', 'North'],
              ['boundary_south', 'South'],
            ] as const).map(([name, label]) => (
              <div key={name} className="space-y-2">
                <Label htmlFor={name}>{label}</Label>
                <Input id={name} readOnly className="bg-zinc-50" {...register(name)} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">
            {boundaryState.state === 'ambiguous'
              ? `Flat ${unitNo?.trim()} matches more than one row on the boundary schedule, so nothing was filled in.`
              : unitNo?.trim()
                ? `Flat ${unitNo.trim()} is not on the current boundary schedule. The previous boundary list is not used.`
                : 'Boundaries fill in when a unit from the schedule is selected.'}
          </p>
        )}
      </div>

      <div className="flex justify-end pt-4 border-t border-zinc-200">
        <Button type="submit" className="gap-2">
          Continue
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </form>
  )
}
