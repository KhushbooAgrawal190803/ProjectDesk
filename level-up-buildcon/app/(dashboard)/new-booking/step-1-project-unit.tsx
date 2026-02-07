'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { step1Schema, Step1Data } from '@/lib/validations/booking'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

const getErrorMessage = (error: any): string | null => {
  if (!error) return null
  return typeof error.message === 'string' ? error.message : null
}

interface Step1ProjectUnitProps {
  data: Partial<Step1Data>
  onUpdate: (data: Partial<Step1Data>) => void
  onNext: () => void
}

export function Step1ProjectUnit({ data, onUpdate, onNext }: Step1ProjectUnitProps) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
    defaultValues: data,
  })

  const unitType = watch('unit_type')

  const onSubmit = (formData: Step1Data) => {
    onUpdate(formData)
    onNext()
  }

  const handleError = () => {
    toast.error('Please fill in all required fields correctly')
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, handleError)} className="space-y-6">
      {/* Project Information */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Project Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="project_name">Project Name *</Label>
            <Input
              id="project_name"
              {...register('project_name')}
              placeholder="Enter project name"
            />
            {errors.project_name && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.project_name)}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="project_location">Location *</Label>
            <Input
              id="project_location"
              {...register('project_location')}
              placeholder="City, State"
            />
            {errors.project_location && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.project_location)}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="rera_regn_no">RERA Registration No.</Label>
            <Input
              id="rera_regn_no"
              {...register('rera_regn_no')}
              placeholder="Optional"
            />
          </div>
        </div>
      </div>

      {/* Unit Information */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Unit Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="unit_category">Unit Category *</Label>
            <div className="flex gap-2">
              <label className="flex-1">
                <input
                  type="radio"
                  value="Residential"
                  {...register('unit_category')}
                  className="peer sr-only"
                />
                <div className="flex items-center justify-center h-11 px-4 border-2 border-zinc-200 rounded-lg cursor-pointer peer-checked:border-zinc-900 peer-checked:bg-zinc-50 transition-all">
                  <span className="font-medium">Residential</span>
                </div>
              </label>
              <label className="flex-1">
                <input
                  type="radio"
                  value="Commercial"
                  {...register('unit_category')}
                  className="peer sr-only"
                />
                <div className="flex items-center justify-center h-11 px-4 border-2 border-zinc-200 rounded-lg cursor-pointer peer-checked:border-zinc-900 peer-checked:bg-zinc-50 transition-all">
                  <span className="font-medium">Commercial</span>
                </div>
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="unit_type">Unit Type *</Label>
            <select
              id="unit_type"
              {...register('unit_type')}
              className="flex h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
            >
              <option value="Flat">Flat</option>
              <option value="Villa">Villa</option>
              <option value="Plot">Plot</option>
              <option value="Shop">Shop</option>
              <option value="Office">Office</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {unitType === 'Other' && (
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="unit_type_other_text">Specify Unit Type *</Label>
              <Input
                id="unit_type_other_text"
                {...register('unit_type_other_text')}
                placeholder="Enter unit type"
              />
              {errors.unit_type_other_text && (
                <p className="text-sm text-red-600">{getErrorMessage(errors.unit_type_other_text)}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="unit_no">Unit Number *</Label>
            <Input
              id="unit_no"
              {...register('unit_no')}
              placeholder="e.g., A-101"
            />
            {errors.unit_no && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.unit_no)}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="floor_no">Floor Number</Label>
            <Input
              id="floor_no"
              {...register('floor_no')}
              placeholder="e.g., Ground, 1st, 2nd"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="super_builtup_area">Super Built-up Area (sq.ft.)</Label>
            <Input
              id="super_builtup_area"
              type="number"
              step="0.01"
              {...register('super_builtup_area')}
              placeholder="e.g., 1200"
            />
            {errors.super_builtup_area && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.super_builtup_area)}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="carpet_area">Carpet Area (sq.ft.)</Label>
            <Input
              id="carpet_area"
              type="number"
              step="0.01"
              {...register('carpet_area')}
              placeholder="e.g., 1000"
            />
            {errors.carpet_area && (
              <p className="text-sm text-red-600">{getErrorMessage(errors.carpet_area)}</p>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end pt-4 border-t border-zinc-200">
        <Button type="submit" className="gap-2">
          Continue
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </form>
  )
}

