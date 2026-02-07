const fs = require('fs');

// Simple PDF generation without the full build system
function formatCurrency(amount) {
  return `₹ ${(amount / 100000).toFixed(2)} L`;
}

function escapeLine(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function createPDF(content, isCompanyCopy = true) {
  const lines = content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.match(/^[=\-─]+$/));

  let stream = '';

  // White background
  stream += '1 1 1 rg\n';
  stream += '0 0 612 792 re\nf\n';

  // BLUE HEADER - Full width, tall
  stream += '0.1 0.3 0.6 rg\n'; // Professional blue
  stream += '0 740 612 52 re\nf\n';

  // Company name - white, large
  stream += 'BT\n';
  stream += '/F2 44 Tf\n'; // Bold Times-Roman
  stream += '1 1 1 rg\n';
  stream += '40 768 Td\n';
  stream += '(LEVEL UP BUILDCON) Tj\n';
  stream += 'ET\n';

  // Document type - white
  stream += 'BT\n';
  stream += '/F1 14 Tf\n';
  stream += '0.9 0.9 0.9 rg\n';
  stream += '40 750 Td\n';
  const docType = isCompanyCopy ? 'Booking Confirmation - Company Record' : 'Booking Confirmation - Customer Copy';
  stream += `(${escapeLine(docType)}) Tj\n`;
  stream += 'ET\n';

  // Content area - spacious, full page layout
  let y = 730;
  const leftMargin = 50;
  const valueMargin = 280; // Much wider for better column separation
  const fieldSpacing = 5;
  const sectionSpacing = 14;

  let currentSection = '';
  let dataInSection = [];

  function renderSection(sectionName, data, startY) {
    if (data.length === 0) return startY;

    let y = startY;

    // Section header - large blue text, no background
    stream += 'BT\n';
    stream += '/F2 14 Tf\n'; // Bold
    stream += '0.1 0.3 0.6 rg\n'; // Blue
    stream += `${leftMargin} ${y} Td\n`;
    stream += `(${escapeLine(sectionName)}) Tj\n`;
    stream += 'ET\n';

    y -= sectionSpacing;

    // Data rows - large fonts, no separators
    for (const item of data) {
      if (y < 60) break;

      // Label only (no colon, value will be on same line)
      stream += 'BT\n';
      stream += '/F2 10 Tf\n'; // Bold
      stream += '0.1 0.3 0.6 rg\n'; // Blue
      stream += `${leftMargin} ${y} Td\n`;
      stream += `(${escapeLine(item.label)}) Tj\n`;
      stream += 'ET\n';

      // Value on same line, well separated
      stream += 'BT\n';
      stream += '/F1 10 Tf\n';
      stream += '0.15 0.15 0.15 rg\n'; // Darker text
      stream += `${valueMargin} ${y} Td\n`;
      stream += `(${escapeLine(item.value)}) Tj\n`;
      stream += 'ET\n';

      y -= fieldSpacing + 3;
    }

    return y - 6;
  }

  // Parse and group data by sections
  for (const line of lines) {
    const isSection =
      line.includes('INFORMATION') ||
      line.includes('DETAILS') ||
      line.includes('CONFIRMATION') ||
      line.includes('SUMMARY') ||
      line.includes('CONTACT') ||
      line.includes('NOTES') ||
      line.includes('PAYMENT') ||
      line.includes('PROPERTY') ||
      line.includes('BOOKING') ||
      line.includes('PROJECT') ||
      line.includes('APPLICANT') ||
      line.includes('CO-APPLICANT') ||
      line.includes('PRICING') ||
      line.includes('UNIT');

    if (isSection) {
      if (currentSection && dataInSection.length > 0) {
        y = renderSection(currentSection, dataInSection, y);
      }
      currentSection = line;
      dataInSection = [];
    } else if (line && !line.match(/^Dear|^Your|^Thank|^Keep|^Further|^Contact/)) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const label = line.substring(0, colonIdx).trim();
        const value = line.substring(colonIdx + 1).trim();
        dataInSection.push({ label, value });
      }
    }
  }

  if (currentSection && dataInSection.length > 0) {
    y = renderSection(currentSection, dataInSection, y);
  }

  // BLUE FOOTER - Full width
  stream += '0.1 0.3 0.6 rg\n';
  stream += '0 0 612 30 re\nf\n';

  // Footer text - white
  stream += 'BT\n';
  stream += '/F1 8 Tf\n';
  stream += '1 1 1 rg\n';
  stream += '40 15 Td\n';
  const docTypeFooter = isCompanyCopy ? 'COMPANY RECORD' : 'CUSTOMER COPY';
  stream += `(${escapeLine(docTypeFooter)} | Generated: ${new Date().toLocaleDateString()} | www.levelupbuildcon.com) Tj\n`;
  stream += 'ET\n';

  const len = stream.length;

  // PDF structure with Times-Roman font family
  const obj1 = '<< /Type /Catalog /Pages 2 0 R >>';
  const obj2 = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  const obj3 = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>';
  const obj4 = `<< /Length ${len} >>\nstream\n${stream}endstream`;
  const obj5 = '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>';
  const obj6 = '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>';

  let pdf = '%PDF-1.4\n';
  let offset1 = pdf.length;
  pdf += `1 0 obj\n${obj1}\nendobj\n`;
  let offset2 = pdf.length;
  pdf += `2 0 obj\n${obj2}\nendobj\n`;
  let offset3 = pdf.length;
  pdf += `3 0 obj\n${obj3}\nendobj\n`;
  let offset4 = pdf.length;
  pdf += `4 0 obj\n${obj4}\nendobj\n`;
  let offset5 = pdf.length;
  pdf += `5 0 obj\n${obj5}\nendobj\n`;
  let offset6 = pdf.length;
  pdf += `6 0 obj\n${obj6}\nendobj\n`;

  let xrefOffset = pdf.length;
  pdf += 'xref\n0 7\n0000000000 65535 f \n';
  pdf += `${offset1.toString().padStart(10, '0')} 00000 n \n`;
  pdf += `${offset2.toString().padStart(10, '0')} 00000 n \n`;
  pdf += `${offset3.toString().padStart(10, '0')} 00000 n \n`;
  pdf += `${offset4.toString().padStart(10, '0')} 00000 n \n`;
  pdf += `${offset5.toString().padStart(10, '0')} 00000 n \n`;
  pdf += `${offset6.toString().padStart(10, '0')} 00000 n \n`;
  pdf += 'trailer\n<< /Size 7 /Root 1 0 R >>\n';
  pdf += 'startxref\n';
  pdf += `${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'utf-8');
}

// Test data
const testBooking = {
  serial_display: 'LUBC-000001',
  status: 'CONFIRMED',
  submitted_at: new Date().toISOString(),
  project_name: 'Ranchi Residential Complex',
  project_location: 'Ranchi, Jharkhand',
  rera_regn_no: 'RJ/REG/2023/12345',
  unit_category: 'Residential',
  unit_type: 'Flat',
  unit_no: '101',
  floor_no: '1',
  super_builtup_area: '12223',
  carpet_area: '2123',
  applicant_name: 'Ravi Kumar',
  applicant_father_or_spouse: 'Efi Kumar',
  applicant_mobile: '7070350111',
  applicant_email: 'ravi@example.com',
  applicant_pan: 'ABCDE1234F',
  applicant_aadhaar: '****1234',
  coapplicant_name: null,
  coapplicant_relationship: null,
  coapplicant_mobile: null,
  coapplicant_pan: null,
  coapplicant_aadhaar: null,
  basic_sale_price: 1293102,
  other_charges: 0,
  total_cost: 1293102,
  booking_amount_paid: 900000,
  payment_mode: 'UPI',
  txn_or_cheque_no: 'TXN123456',
  payment_plan_type: 'ConstructionLinked',
};

// Generate company copy
const companyContent = `PROJECT INFORMATION

Project Name: ${testBooking.project_name}
Location: ${testBooking.project_location}
RERA Registration: ${testBooking.rera_regn_no}

BOOKING DETAILS

Serial Number: ${testBooking.serial_display}
Status: ${testBooking.status}
Date: ${testBooking.submitted_at ? new Date(testBooking.submitted_at).toLocaleDateString() : 'N/A'}

UNIT DETAILS

Category: ${testBooking.unit_category}
Type: ${testBooking.unit_type}
Unit Number: ${testBooking.unit_no}
Floor Number: ${testBooking.floor_no}
Super Built-up Area: ${testBooking.super_builtup_area} sq.ft
Carpet Area: ${testBooking.carpet_area} sq.ft

APPLICANT INFORMATION

Name: ${testBooking.applicant_name}
Father/Spouse: ${testBooking.applicant_father_or_spouse}
Mobile: ${testBooking.applicant_mobile}
Email: ${testBooking.applicant_email}
PAN: ${testBooking.applicant_pan}
Aadhaar: ${testBooking.applicant_aadhaar}

PAYMENT INFORMATION

Basic Sale Price: ${formatCurrency(testBooking.basic_sale_price)}
Other Charges: ${formatCurrency(testBooking.other_charges)}
Total Cost: ${formatCurrency(testBooking.total_cost)}
Booking Amount Paid: ${formatCurrency(testBooking.booking_amount_paid)}
Payment Mode: ${testBooking.payment_mode}
Txn/Cheque No: ${testBooking.txn_or_cheque_no}
Payment Plan: ${testBooking.payment_plan_type}`;

const companyPdf = createPDF(companyContent, true);
fs.writeFileSync('c:/Users/khush/ProjectDesk/level-up-buildcon/test-company.pdf', companyPdf);
console.log('✓ Generated test-company.pdf');

// Generate customer copy
const remainingAmount = testBooking.total_cost - testBooking.booking_amount_paid;
const customerContent = `BOOKING CONFIRMATION - CUSTOMER COPY

Dear ${testBooking.applicant_name}

Your booking has been successfully registered with us.

BOOKING DETAILS

Serial Number: ${testBooking.serial_display}
Booking Date: ${testBooking.submitted_at ? new Date(testBooking.submitted_at).toLocaleDateString() : 'N/A'}
Status: ${testBooking.status}

PROJECT DETAILS

Project: ${testBooking.project_name}
Location: ${testBooking.project_location}

UNIT INFORMATION

Type: ${testBooking.unit_type}
Unit Number: ${testBooking.unit_no}
Floor: ${testBooking.floor_no}
Area: ${testBooking.carpet_area} sq.ft

PAYMENT SUMMARY

Total Property Cost: ${formatCurrency(testBooking.total_cost)}
Amount Paid: ${formatCurrency(testBooking.booking_amount_paid)}
Remaining Amount: ${formatCurrency(remainingAmount)}

CONTACT INFORMATION

Name: ${testBooking.applicant_name}
Mobile: ${testBooking.applicant_mobile}
Email: ${testBooking.applicant_email}`;

const customerPdf = createPDF(customerContent, false);
fs.writeFileSync('c:/Users/khush/ProjectDesk/level-up-buildcon/test-customer.pdf', customerPdf);
console.log('✓ Generated test-customer.pdf');

console.log('\nPDFs created successfully! Check the project root folder.');
