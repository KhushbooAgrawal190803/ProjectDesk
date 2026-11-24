import { Booking, Profile } from '@/lib/types/database'
import { jsPDF } from 'jspdf'
import { formatPersonName } from '@/lib/booking/person'
import { formatPaymentMode } from '@/lib/booking/payment-mode'
import { relativeWithRelation } from '@/lib/booking/relationship'
import { isIndividual, representativeLine } from '@/lib/booking/applicant-type'

const formatCurrency = (amount: number | string | null | undefined) => {
  const n = Number(amount ?? 0)
  return `Rs. ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function boundaryRows(booking: Booking): Array<[string, string]> {
  return [
    ['East', booking.boundary_east || ''],
    ['West', booking.boundary_west || ''],
    ['North', booking.boundary_north || ''],
    ['South', booking.boundary_south || ''],
  ].filter((row) => row[1]) as Array<[string, string]>
}

export function generateCompanyPDF(booking: Booking & { creator?: Profile }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      })

      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      let yPos = 12

      // Decorative top border - Muted blue color
      doc.setDrawColor(75, 105, 145)
      doc.setLineWidth(2)
      doc.line(15, 8, pageWidth - 15, 8)

      // Logo/Title area - Elegant design
      doc.setFillColor(248, 250, 252) // Light background
      doc.rect(15, 9, pageWidth - 30, 22, 'F')
      
      // Left side - Company info
      doc.setTextColor(75, 105, 145)
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text('LEVEL UP BUILDCON', 20, 16)
      
      doc.setTextColor(102, 115, 140)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text('Property Booking Confirmation', 20, 23)
      
      // Right side - Address and Document ID
      doc.setTextColor(60, 70, 85)
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'bold')
      const regAddressLines = doc.splitTextToSize('Registered office: ASHIRWAD, 452 A, GROUND FLOOR, PEE PEE COMPOUND, MAIN ROAD, RANCHI', 50)
      doc.text(regAddressLines, pageWidth - 65, 11)
      
      doc.setTextColor(150, 160, 175)
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.text(`Document ID: ${booking.serial_display}`, pageWidth - 65, 28)

      yPos = 32

      // Section helper with better styling
      const addSection = (title: string) => {
        // Section header with underline
        doc.setTextColor(255, 255, 255)
        doc.setFillColor(75, 105, 145)
        doc.rect(15, yPos - 3, pageWidth - 30, 6, 'F')
        
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text(title, 20, yPos + 0.5)
        
        yPos += 8
      }

      // Row helper with better formatting
      const addRow = (label: string, value: string) => {
        const maxValueWidth = pageWidth - 110
        const splitValue = String(value).split('\n').flatMap((line) => doc.splitTextToSize(line || ' ', maxValueWidth))
        const lineHeight = 4.5
        const rowHeight = Math.max(5.5, splitValue.length * lineHeight + 1)

        if (yPos + rowHeight > pageHeight - 25) {
          doc.addPage()
          yPos = 15
        }

        // Alternating light background
        if (Math.floor(yPos / 6) % 2 === 0) {
          doc.setFillColor(248, 250, 252)
          doc.rect(15, yPos - 4, pageWidth - 30, rowHeight, 'F')
        }

        doc.setTextColor(75, 105, 145)
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text(label, 20, yPos + 0.5)

        doc.setTextColor(60, 70, 85)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.text(splitValue, 95, yPos + 0.5)

        yPos += rowHeight + 0.5
      }

      // PROJECT INFORMATION
      addSection('PROJECT INFORMATION')
      addRow('Project Name', booking.project_name || 'N/A')
      addRow('Location', booking.project_location || 'N/A')
      if (booking.project_address) addRow('Address', booking.project_address)
      addRow('RERA Registration', booking.rera_regn_no || 'N/A')
      if (booking.building_permit_no) addRow('Building Permit', booking.building_permit_no)
      yPos += 3

      // BOOKING DETAILS
      addSection('BOOKING DETAILS')
      addRow('Serial Number', booking.serial_display || 'N/A')
      addRow('Status', booking.status || 'N/A')
      addRow('Date', booking.submitted_at ? new Date(booking.submitted_at).toLocaleDateString('en-IN') : 'N/A')
      yPos += 3

      // UNIT DETAILS
      addSection('UNIT DETAILS')
      addRow('Category', booking.unit_category || 'N/A')
      addRow('Type', booking.unit_type || 'N/A')
      addRow('Unit Number', booking.unit_no || 'N/A')
      addRow('Floor Number', booking.floor_no || 'N/A')
      addRow('Built-up Area', `${booking.builtup_area != null ? booking.builtup_area : 'N/A'} sq.ft`)
      addRow('Super Built-up Area', `${booking.super_builtup_area || 'N/A'} sq.ft`)
      addRow('Carpet Area', `${booking.carpet_area || 'N/A'} sq.ft`)
      for (const [label, value] of boundaryRows(booking)) addRow(label, value)
      yPos += 3

      // APPLICANT INFORMATION
      addSection('APPLICANT INFORMATION')
      addRow('Name', formatPersonName(booking.applicant_salutation, booking.applicant_name) || 'N/A')
      if (isIndividual(booking.applicant_type)) {
        addRow('Parents/Spouse', relativeWithRelation(booking.applicant_father_or_spouse, booking.applicant_relationship) || 'N/A')
      } else {
        addRow('Applicant Type', booking.applicant_type || 'N/A')
        addRow('Represented By', representativeLine(booking.applicant_representative_designation, booking.applicant_representative) || 'N/A')
      }
      addRow('Mobile', booking.applicant_mobile || 'N/A')
      addRow('Email', booking.applicant_email || 'N/A')
      addRow('PAN', booking.applicant_pan || 'N/A')
      addRow('Aadhaar', booking.applicant_aadhaar || 'N/A')
      if (booking.applicant_address) addRow('Address', booking.applicant_address)
      yPos += 3

      const coapplicants = booking.coapplicants?.length
        ? booking.coapplicants
        : booking.coapplicant_name
          ? [{
              id: 'legacy',
              name: booking.coapplicant_name,
              father_or_spouse: booking.coapplicant_relationship,
              mobile: booking.coapplicant_mobile,
              pan: booking.coapplicant_pan,
              aadhaar: booking.coapplicant_aadhaar,
              address: null,
            }]
          : []
      coapplicants.forEach((person, index) => {
        addSection(coapplicants.length > 1 ? `CO-APPLICANT ${index + 1}` : 'CO-APPLICANT INFORMATION')
        addRow('Name', formatPersonName(person.salutation, person.name) || 'N/A')
        addRow('Parents/Spouse', relativeWithRelation(person.father_or_spouse, 'relationship' in person ? person.relationship : null) || 'N/A')
        addRow('Mobile', person.mobile || 'N/A')
        if (person.email) addRow('Email', person.email)
        addRow('PAN', person.pan || 'N/A')
        addRow('Aadhaar', person.aadhaar || 'N/A')
        if (person.address) addRow('Address', person.address)
        yPos += 3
      })

      // PAYMENT INFORMATION
      addSection('PAYMENT INFORMATION')
      if (booking.rate_per_sqft) {
        addRow('Rate per Sq.ft.', formatCurrency(booking.rate_per_sqft))
      }
      addRow('Flat consideration', formatCurrency(booking.basic_sale_price || booking.total_cost || 0))
      addRow('Parking Charges', formatCurrency(booking.total_parking_charges || 0))
      addRow('Total Consideration', formatCurrency(booking.total_property_value || booking.total_cost || 0))
      addRow('Booking Amount Paid', formatCurrency(booking.booking_amount_paid || 0))
      addRow('GST Applicable (5%)', formatCurrency(booking.gst_amount || 0))
      addRow('GST Collected', formatCurrency(booking.gst_collected || 0))
      addRow('Payment Mode', formatPaymentMode(booking.payment_mode, booking.payment_mode === 'Other' ? booking.payment_mode_detail : undefined) || 'N/A')
      if (booking.txn_or_cheque_no) {
        addRow('Txn/Cheque No', booking.txn_or_cheque_no)
      }
      addRow('Payment Plan', booking.payment_plan_type || 'N/A')
      if (booking.parking_spaces?.length) {
        yPos += 3
        addSection('PARKING')
        for (const space of booking.parking_spaces) {
          const kind = space.kind === 'secondary' ? 'Secondary' : 'Main'
          const count = Number(space.quantity) > 1 ? ` (${space.quantity})` : ''
          addRow(`${kind} parking${count}`, formatCurrency(space.price || 0))
        }
      }
      if (booking.schedule_rows?.length) {
        yPos += 3
        addSection('PAYMENT SCHEDULE')
        for (const row of booking.schedule_rows) {
          const label = row.trigger_type === 'date' ? (row.milestone_date || row.label || 'Date') : (row.label || 'Milestone')
          addRow(label, formatCurrency(row.calculated_amount || 0))
        }
      }
      if (booking.noc_required) {
        yPos += 3
        addSection('BANK NOC')
        addRow('Bank', booking.noc_bank_name || 'N/A')
        addRow('Addressee', booking.noc_addressee || 'N/A')
        addRow('Address', booking.noc_bank_address || 'N/A')
      }
      yPos += 5

      // DECLARATION
      doc.setTextColor(75, 105, 145)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text('DECLARATION', 20, yPos)
      yPos += 5

      doc.setTextColor(60, 70, 85)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      const declarationText = 'I/We agree to abide by the terms, conditions and provisions of RERA, 2016. This booking does not constitute final allotment.'
      const splitDeclaration = doc.splitTextToSize(declarationText, pageWidth - 40)
      doc.text(splitDeclaration, 20, yPos)
      yPos += 15

      // Signatures section
      doc.setTextColor(60, 70, 85)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      
      // Applicant signature
      doc.text('Applicant Signature: _____________________', 20, yPos)
      doc.text('Date: _____________________', pageWidth - 70, yPos)
      yPos += 8
      
      // Authorized signatory and company seal
      doc.text('Authorized Signatory: _____________________', 20, yPos)
      doc.text('Company Seal: _____________________', pageWidth - 70, yPos)

      // Footer
      doc.setDrawColor(75, 105, 145)
      doc.setLineWidth(0.5)
      doc.line(15, pageHeight - 12, pageWidth - 15, pageHeight - 12)
      
      doc.setTextColor(120, 130, 145)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.text('COMPANY RECORD', 20, pageHeight - 8)
      doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, pageWidth - 50, pageHeight - 8)

      // Convert to buffer
      const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
      resolve(pdfBuffer)
    } catch (error) {
      console.error('PDF generation error:', error)
      reject(error)
    }
  })
}

export function generateCustomerPDF(booking: Booking & { creator?: Profile }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      })

      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      let yPos = 12

      // Decorative top border
      doc.setDrawColor(75, 105, 145)
      doc.setLineWidth(2)
      doc.line(15, 8, pageWidth - 15, 8)

      // Logo/Title area - Elegant design
      doc.setFillColor(248, 250, 252)
      doc.rect(15, 9, pageWidth - 30, 22, 'F')
      
      // Left side - Company info
      doc.setTextColor(75, 105, 145)
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text('LEVEL UP BUILDCON', 20, 16)
      
      doc.setTextColor(102, 115, 140)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text('Property Booking Confirmation', 20, 23)
      
      // Right side - Address and Document ID
      doc.setTextColor(60, 70, 85)
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'bold')
      const regAddressLines = doc.splitTextToSize('Registered office: ASHIRWAD, 452 A, GROUND FLOOR, PEE PEE COMPOUND, MAIN ROAD, RANCHI', 50)
      doc.text(regAddressLines, pageWidth - 65, 11)
      
      doc.setTextColor(150, 160, 175)
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.text(`Document ID: ${booking.serial_display}`, pageWidth - 65, 28)

      yPos = 35

      // Greeting message
      doc.setTextColor(75, 105, 145)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text(`Dear ${booking.applicant_name || 'Valued Customer'},`, 20, yPos)
      yPos += 5

      doc.setTextColor(60, 70, 85)
      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'normal')
      const greetingText = 'Thank you for choosing Level Up Buildcon! Your booking has been successfully registered with us. Please find all booking details below.'
      const splitGreeting = doc.splitTextToSize(greetingText, pageWidth - 40)
      doc.text(splitGreeting, 20, yPos)
      yPos += 8 + (splitGreeting.length - 1) * 3

      // Section helper
      const addSection = (title: string) => {
        doc.setTextColor(255, 255, 255)
        doc.setFillColor(75, 105, 145)
        doc.rect(15, yPos - 4, pageWidth - 30, 7, 'F')
        
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.text(title, 20, yPos + 1)
        
        yPos += 10
      }

      // Row helper
      const addRow = (label: string, value: string) => {
        const maxValueWidth = pageWidth - 110
        const splitValue = String(value).split('\n').flatMap((line) => doc.splitTextToSize(line || ' ', maxValueWidth))
        const lineHeight = 4.5
        const rowHeight = Math.max(5.5, splitValue.length * lineHeight + 1)

        if (yPos + rowHeight > pageHeight - 25) {
          doc.addPage()
          yPos = 15
        }

        if (Math.floor(yPos / 6) % 2 === 0) {
          doc.setFillColor(248, 250, 252)
          doc.rect(15, yPos - 4, pageWidth - 30, rowHeight, 'F')
        }

        doc.setTextColor(75, 105, 145)
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text(label, 20, yPos + 0.5)

        doc.setTextColor(60, 70, 85)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.text(splitValue, 95, yPos + 0.5)

        yPos += rowHeight + 0.5
      }

      // BOOKING DETAILS
      addSection('BOOKING DETAILS')
      addRow('Serial Number', booking.serial_display || 'N/A')
      addRow('Booking Date', booking.submitted_at ? new Date(booking.submitted_at).toLocaleDateString('en-IN') : 'N/A')
      yPos += 4

      // PROJECT DETAILS
      addSection('PROJECT DETAILS')
      addRow('Project', booking.project_name || 'N/A')
      addRow('Location', booking.project_location || 'N/A')
      if (booking.project_address) addRow('Address', booking.project_address)
      if (booking.rera_regn_no) addRow('RERA Registration', booking.rera_regn_no)
      if (booking.building_permit_no) addRow('Building Permit', booking.building_permit_no)
      yPos += 4

      // UNIT INFORMATION
      addSection('UNIT INFORMATION')
      addRow('Type', booking.unit_type || 'N/A')
      addRow('Unit Number', booking.unit_no || 'N/A')
      addRow('Floor', booking.floor_no || 'N/A')
      // Prefer super built-up area for total area display, then built-up, then carpet
      const area =
        booking.super_builtup_area ??
        booking.builtup_area ??
        booking.carpet_area
      addRow('Area', `${area != null ? area : 'N/A'} sq.ft`)
      for (const [label, value] of boundaryRows(booking)) addRow(label, value)
      yPos += 4

      // PAYMENT SUMMARY
      addSection('PAYMENT SUMMARY')
      const propertyValue = Number(booking.total_property_value || booking.total_cost || 0)
      const remainingAmount = propertyValue - Number(booking.booking_amount_paid || 0)
      if (booking.rate_per_sqft) {
        addRow('Rate per Sq.ft.', formatCurrency(booking.rate_per_sqft))
      }
      addRow('Flat consideration', formatCurrency(booking.basic_sale_price || booking.total_cost || 0))
      addRow('Parking Charges', formatCurrency(booking.total_parking_charges || 0))
      addRow('Total Consideration', formatCurrency(booking.total_property_value || booking.total_cost || 0))
      addRow('Amount Paid', formatCurrency(booking.booking_amount_paid || 0))
      addRow('GST Applicable (5%)', formatCurrency(booking.gst_amount || 0))
      addRow('GST Collected', formatCurrency(booking.gst_collected || 0))
      addRow('Remaining Amount', formatCurrency(remainingAmount))
      yPos += 4

      // CONTACT INFORMATION
      addSection('APPLICANT INFORMATION')
      addRow('Name', formatPersonName(booking.applicant_salutation, booking.applicant_name) || 'N/A')
      if (!isIndividual(booking.applicant_type)) {
        addRow('Represented By', representativeLine(booking.applicant_representative_designation, booking.applicant_representative) || 'N/A')
      }
      addRow('Mobile', booking.applicant_mobile || 'N/A')
      addRow('Email', booking.applicant_email || 'N/A')
      if (booking.applicant_pan) addRow('PAN', booking.applicant_pan)
      if (booking.applicant_aadhaar) addRow('Aadhaar', booking.applicant_aadhaar)
      if (booking.applicant_address) addRow('Address', booking.applicant_address)
      yPos += 4

      const customerCoapplicants = booking.coapplicants?.length
        ? booking.coapplicants
        : booking.coapplicant_name
          ? [{ id: 'legacy', name: booking.coapplicant_name, father_or_spouse: booking.coapplicant_relationship, mobile: booking.coapplicant_mobile, email: null, pan: booking.coapplicant_pan, aadhaar: booking.coapplicant_aadhaar, address: null }]
          : []
      customerCoapplicants.forEach((person, index) => {
        addSection(customerCoapplicants.length > 1 ? `CO-APPLICANT ${index + 1}` : 'CO-APPLICANT INFORMATION')
        addRow('Name', formatPersonName(person.salutation, person.name) || 'N/A')
        if (person.father_or_spouse) addRow('Parents/Spouse', relativeWithRelation(person.father_or_spouse, 'relationship' in person ? person.relationship : null))
        if (person.mobile) addRow('Mobile', person.mobile)
        if (person.address) addRow('Address', person.address)
        yPos += 4
      })
      if (booking.schedule_rows?.length) {
        addSection('PAYMENT SCHEDULE')
        for (const row of booking.schedule_rows) {
          const label = row.trigger_type === 'date' ? (row.milestone_date || row.label || 'Date') : (row.label || 'Milestone')
          addRow(label, formatCurrency(row.calculated_amount || 0))
        }
        yPos += 4
      }
      if (booking.noc_required) {
        addSection('BANK NOC')
        addRow('Bank', booking.noc_bank_name || 'N/A')
        addRow('Addressee', booking.noc_addressee || 'N/A')
        addRow('Address', booking.noc_bank_address || 'N/A')
        yPos += 4
      }

      // Important note
      doc.setTextColor(75, 105, 145)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text('Important Information', 20, yPos)
      yPos += 5

      doc.setTextColor(60, 70, 85)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      const importantText = 'Keep this document safely for your records. Further payment details and transaction updates will be communicated separately. For any queries, please contact us with your booking serial number.'
      const splitImportant = doc.splitTextToSize(importantText, pageWidth - 40)
      doc.text(splitImportant, 20, yPos)
      yPos += 12

      // Check if we need a new page for signatures
      if (yPos > pageHeight - 30) {
        doc.addPage()
        yPos = 15
      }

      // Signatures for customer copy
      doc.setTextColor(60, 70, 85)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text('Authorized Signatory: _____________________', 20, yPos)
      doc.text('Company Seal: _____________________', pageWidth - 70, yPos)
      yPos += 8

      // Closing
      doc.setTextColor(75, 105, 145)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text('Best Regards,', 20, yPos)
      yPos += 5
      doc.setTextColor(60, 70, 85)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text('Level Up Buildcon Team', 20, yPos)

      // Footer
      doc.setDrawColor(75, 105, 145)
      doc.setLineWidth(0.5)
      doc.line(15, pageHeight - 12, pageWidth - 15, pageHeight - 12)
      
      doc.setTextColor(120, 130, 145)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.text('CUSTOMER COPY', 20, pageHeight - 8)
      doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, pageWidth - 50, pageHeight - 8)

      // Convert to buffer
      const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
      resolve(pdfBuffer)
    } catch (error) {
      console.error('PDF generation error:', error)
      reject(error)
    }
  })
}
