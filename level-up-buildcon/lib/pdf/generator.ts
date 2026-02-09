import { Booking, Profile } from '@/lib/types/database'
import { jsPDF } from 'jspdf'

const formatCurrency = (amount: number) => {
  return `Rs. ${(amount || 0).toLocaleString('en-IN')}`
}

export function generateCompanyPDF(booking: Booking & { creator?: Profile }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      console.log('Generating Company PDF with booking data:', {
        serial_display: booking.serial_display,
        project_name: booking.project_name,
        applicant_name: booking.applicant_name,
        total_cost: booking.total_cost,
        booking_amount_paid: booking.booking_amount_paid,
        unit_type: booking.unit_type,
        status: booking.status,
      })

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
        // Alternating light background
        if (Math.floor(yPos / 6) % 2 === 0) {
          doc.setFillColor(248, 250, 252)
          doc.rect(15, yPos - 4, pageWidth - 30, 5.5, 'F')
        }

        doc.setTextColor(75, 105, 145)
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text(label, 20, yPos + 0.5)

        doc.setTextColor(60, 70, 85)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        // Increased width to prevent currency values from wrapping
        const maxValueWidth = pageWidth - 110
        const splitValue = doc.splitTextToSize(value, maxValueWidth)
        // If it's a currency value and it wrapped, use single line at smaller size
        if (splitValue.length > 1 && value.includes('₹')) {
          doc.setFontSize(9)
          doc.text(value, 95, yPos + 0.5)
          doc.setFontSize(10)
        } else {
          doc.text(splitValue, 95, yPos + 0.5)
        }

        yPos += 6

        if (yPos > pageHeight - 25) {
          doc.addPage()
          yPos = 15
        }
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
      addRow('Super Built-up Area', `${booking.super_builtup_area || 'N/A'} sq.ft`)
      addRow('Carpet Area', `${booking.carpet_area || 'N/A'} sq.ft`)
      yPos += 3

      // APPLICANT INFORMATION
      addSection('APPLICANT INFORMATION')
      addRow('Name', booking.applicant_name || 'N/A')
      addRow('Father/Spouse', booking.applicant_father_or_spouse || 'N/A')
      addRow('Mobile', booking.applicant_mobile || 'N/A')
      addRow('Email', booking.applicant_email || 'N/A')
      addRow('PAN', booking.applicant_pan || 'N/A')
      addRow('Aadhaar', booking.applicant_aadhaar || 'N/A')
      yPos += 3

      // CO-APPLICANT (if exists)
      if (booking.coapplicant_name) {
        addSection('CO-APPLICANT INFORMATION')
        addRow('Name', booking.coapplicant_name)
        addRow('Relationship', booking.coapplicant_relationship || 'N/A')
        addRow('Mobile', booking.coapplicant_mobile || 'N/A')
        addRow('PAN', booking.coapplicant_pan || 'N/A')
        addRow('Aadhaar', booking.coapplicant_aadhaar || 'N/A')
        yPos += 3
      }

      // PAYMENT INFORMATION
      addSection('PAYMENT INFORMATION')
      addRow('Basic Sale Price', formatCurrency(booking.basic_sale_price || 0))
      addRow('Other Charges', formatCurrency(booking.other_charges || 0))
      addRow('Total Cost', formatCurrency(booking.total_cost || 0))
      addRow('Booking Amount Paid', formatCurrency(booking.booking_amount_paid || 0))
      addRow('Payment Mode', booking.payment_mode || 'N/A')
      if (booking.txn_or_cheque_no) {
        addRow('Txn/Cheque No', booking.txn_or_cheque_no)
      }
      addRow('Payment Plan', booking.payment_plan_type || 'N/A')
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
      console.log('Generating Customer PDF with booking data:', {
        serial_display: booking.serial_display,
        applicant_name: booking.applicant_name,
        project_name: booking.project_name,
        unit_type: booking.unit_type,
        total_cost: booking.total_cost,
        booking_amount_paid: booking.booking_amount_paid,
      })

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
        if (Math.floor(yPos / 6) % 2 === 0) {
          doc.setFillColor(248, 250, 252)
          doc.rect(15, yPos - 4, pageWidth - 30, 5.5, 'F')
        }

        doc.setTextColor(75, 105, 145)
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text(label, 20, yPos + 0.5)

        doc.setTextColor(60, 70, 85)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        // Increased width to prevent currency values from wrapping
        const maxValueWidth = pageWidth - 110
        const splitValue = doc.splitTextToSize(value, maxValueWidth)
        // If it's a currency value and it wrapped, use single line at smaller size
        if (splitValue.length > 1 && value.includes('₹')) {
          doc.setFontSize(9)
          doc.text(value, 95, yPos + 0.5)
          doc.setFontSize(10)
        } else {
          doc.text(splitValue, 95, yPos + 0.5)
        }

        yPos += 6

        if (yPos > pageHeight - 25) {
          doc.addPage()
          yPos = 15
        }
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
      addRow('Area', `${booking.carpet_area || 'N/A'} sq.ft`)
      yPos += 4

      // PAYMENT SUMMARY
      addSection('PAYMENT SUMMARY')
      const remainingAmount = (booking.total_cost || 0) - (booking.booking_amount_paid || 0)
      addRow('Total Property Cost', formatCurrency(booking.total_cost || 0))
      addRow('Amount Paid', formatCurrency(booking.booking_amount_paid || 0))
      addRow('Remaining Amount', formatCurrency(remainingAmount))
      yPos += 4

      // CONTACT INFORMATION
      addSection('APPLICANT INFORMATION')
      addRow('Name', booking.applicant_name || 'N/A')
      addRow('Mobile', booking.applicant_mobile || 'N/A')
      addRow('Email', booking.applicant_email || 'N/A')
      if (booking.applicant_pan) addRow('PAN', booking.applicant_pan)
      if (booking.applicant_aadhaar) addRow('Aadhaar', booking.applicant_aadhaar)
      yPos += 4

      // CO-APPLICANT (if exists)
      if (booking.coapplicant_name) {
        addSection('CO-APPLICANT INFORMATION')
        addRow('Name', booking.coapplicant_name)
        addRow('Relationship', booking.coapplicant_relationship || 'N/A')
        if (booking.coapplicant_mobile) addRow('Mobile', booking.coapplicant_mobile)
        if (booking.coapplicant_pan) addRow('PAN', booking.coapplicant_pan)
        if (booking.coapplicant_aadhaar) addRow('Aadhaar', booking.coapplicant_aadhaar)
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
