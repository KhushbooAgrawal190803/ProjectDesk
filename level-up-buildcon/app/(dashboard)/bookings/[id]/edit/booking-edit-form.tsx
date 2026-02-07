'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Booking } from '@/lib/types/database'
import { updateBooking } from './actions'

interface BookingEditFormProps {
  booking: Booking
}

export function BookingEditForm({ booking }: BookingEditFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    // Project & Unit
    project_name: booking.project_name,
    project_location: booking.project_location,
    rera_regn_no: booking.rera_regn_no || '',
    unit_category: booking.unit_category,
    unit_type: booking.unit_type,
    unit_type_other_text: booking.unit_type_other_text || '',
    unit_no: booking.unit_no,
    floor_no: booking.floor_no || '',
    super_builtup_area: booking.super_builtup_area || '',
    carpet_area: booking.carpet_area || '',

    // Applicant
    applicant_name: booking.applicant_name,
    applicant_father_or_spouse: booking.applicant_father_or_spouse,
    applicant_mobile: booking.applicant_mobile,
    applicant_email: booking.applicant_email || '',
    applicant_pan: booking.applicant_pan || '',
    applicant_aadhaar: booking.applicant_aadhaar || '',
    applicant_address: booking.applicant_address || '',

    // Co-applicant
    coapplicant_name: booking.coapplicant_name || '',
    coapplicant_relationship: booking.coapplicant_relationship || '',
    coapplicant_mobile: booking.coapplicant_mobile || '',
    coapplicant_pan: booking.coapplicant_pan || '',
    coapplicant_aadhaar: booking.coapplicant_aadhaar || '',

    // Pricing & Payment
    basic_sale_price: booking.basic_sale_price,
    other_charges: booking.other_charges || 0,
    total_cost: booking.total_cost,
    total_cost_override_reason: booking.total_cost_override_reason || '',
    booking_amount_paid: booking.booking_amount_paid,
    payment_mode: booking.payment_mode,
    payment_mode_detail: booking.payment_mode_detail || '',
    txn_or_cheque_no: booking.txn_or_cheque_no || '',
    txn_date: booking.txn_date || '',

    // Payment Plan
    payment_plan_type: booking.payment_plan_type,
    payment_plan_custom_text: booking.payment_plan_custom_text || '',
  })

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Normalize numeric fields
      const normalizedData = {
        ...formData,
        super_builtup_area: formData.super_builtup_area ? parseFloat(String(formData.super_builtup_area)) : undefined,
        carpet_area: formData.carpet_area ? parseFloat(String(formData.carpet_area)) : undefined,
        basic_sale_price: formData.basic_sale_price ? parseFloat(String(formData.basic_sale_price)) : undefined,
        other_charges: formData.other_charges ? parseFloat(String(formData.other_charges)) : undefined,
        total_cost: formData.total_cost ? parseFloat(String(formData.total_cost)) : undefined,
        booking_amount_paid: formData.booking_amount_paid ? parseFloat(String(formData.booking_amount_paid)) : undefined,
      }
      await updateBooking(booking.id, normalizedData as any)
      toast.success('Booking updated successfully')
      router.push(`/bookings/${booking.id}`)
    } catch (error: any) {
      toast.error('Failed to update booking', {
        description: error.message,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Project & Unit Section */}
      <div className="space-y-4">
        <h3 className="font-semibold text-zinc-900">Project & Unit Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Project Name *</Label>
            <Input
              name="project_name"
              value={formData.project_name}
              onChange={handleInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Location *</Label>
            <Input
              name="project_location"
              value={formData.project_location}
              onChange={handleInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label>RERA Registration Number</Label>
            <Input
              name="rera_regn_no"
              value={formData.rera_regn_no}
              onChange={handleInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Unit Number *</Label>
            <Input
              name="unit_no"
              value={formData.unit_no}
              onChange={handleInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Floor Number</Label>
            <Input
              name="floor_no"
              value={formData.floor_no}
              onChange={handleInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Super Built-up Area (sq.ft.)</Label>
            <Input
              name="super_builtup_area"
              type="number"
              value={formData.super_builtup_area}
              onChange={handleInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Carpet Area (sq.ft.)</Label>
            <Input
              name="carpet_area"
              type="number"
              value={formData.carpet_area}
              onChange={handleInputChange}
              className="mt-1"
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Applicant Section */}
      <div className="space-y-4">
        <h3 className="font-semibold text-zinc-900">Applicant Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Name *</Label>
            <Input
              name="applicant_name"
              value={formData.applicant_name}
              onChange={handleInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Father's / Spouse Name *</Label>
            <Input
              name="applicant_father_or_spouse"
              value={formData.applicant_father_or_spouse}
              onChange={handleInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Mobile *</Label>
            <Input
              name="applicant_mobile"
              value={formData.applicant_mobile}
              onChange={handleInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              name="applicant_email"
              type="email"
              value={formData.applicant_email}
              onChange={handleInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label>PAN</Label>
            <Input
              name="applicant_pan"
              value={formData.applicant_pan}
              onChange={handleInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Aadhaar</Label>
            <Input
              name="applicant_aadhaar"
              value={formData.applicant_aadhaar}
              onChange={handleInputChange}
              className="mt-1"
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Pricing & Payment Section */}
      <div className="space-y-4">
        <h3 className="font-semibold text-zinc-900">Pricing & Payment</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Basic Sale Price *</Label>
            <Input
              name="basic_sale_price"
              type="number"
              value={formData.basic_sale_price}
              onChange={handleInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Other Charges</Label>
            <Input
              name="other_charges"
              type="number"
              value={formData.other_charges}
              onChange={handleInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Total Cost *</Label>
            <Input
              name="total_cost"
              type="number"
              value={formData.total_cost}
              onChange={handleInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Booking Amount Paid *</Label>
            <Input
              name="booking_amount_paid"
              type="number"
              value={formData.booking_amount_paid}
              onChange={handleInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Payment Mode *</Label>
            <select
              name="payment_mode"
              value={formData.payment_mode}
              onChange={handleInputChange}
              className="mt-1 w-full px-3 py-2 border border-zinc-300 rounded-md"
            >
              <option value="Cash">Cash</option>
              <option value="Cheque">Cheque</option>
              <option value="NEFT_RTGS">NEFT/RTGS</option>
              <option value="UPI">UPI</option>
            </select>
          </div>
          <div>
            <Label>Transaction / Cheque Number</Label>
            <Input
              name="txn_or_cheque_no"
              value={formData.txn_or_cheque_no}
              onChange={handleInputChange}
              className="mt-1"
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
        <Button
          variant="outline"
          onClick={() => router.push(`/bookings/${booking.id}`)}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
