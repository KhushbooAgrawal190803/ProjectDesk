const PDFDocument = require('pdfkit');
const fs = require('fs');

function generateTestPDF() {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        bufferPages: true,
      });

      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // HEADER
      const headerY = doc.y;
      doc.rect(40, headerY, 515, 60).fill('#0052CC');
      doc.fillColor('white').fontSize(32).font('Helvetica-Bold').text('LEVEL UP BUILDCON', 50, headerY + 10);
      doc.fontSize(13).text('Booking Confirmation - Company Record', 50, headerY + 42);

      doc.moveDown(2);

      // SECTION
      doc.fontSize(12).fillColor('#0052CC').font('Helvetica-Bold').text('PROJECT INFORMATION', 50);
      doc.moveDown(0.3);

      // Sample row
      doc.fontSize(10).fillColor('#0052CC').font('Helvetica-Bold').text('Project Name', 50, { width: 180, continued: true });
      doc.fillColor('#333').font('Helvetica').fontSize(10).text('Ranchi Residential Complex', 250, doc.y - 14, { width: 265 });
      doc.moveDown(0.6);

      doc.fontSize(10).fillColor('#0052CC').font('Helvetica-Bold').text('Location', 50, { width: 180, continued: true });
      doc.fillColor('#333').font('Helvetica').fontSize(10).text('Ranchi, Jharkhand', 250, doc.y - 14, { width: 265 });
      doc.moveDown(0.6);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

generateTestPDF()
  .then((buffer) => {
    fs.writeFileSync('c:/Users/khush/ProjectDesk/level-up-buildcon/test-pdfkit.pdf', buffer);
    console.log('✓ PDF generated successfully');
    console.log(`Size: ${buffer.length} bytes`);
  })
  .catch((error) => {
    console.error('✗ PDF generation failed:', error);
  });
