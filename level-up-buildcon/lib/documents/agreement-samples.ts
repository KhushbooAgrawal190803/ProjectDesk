import type { AgreementDocumentInput, AgreementParty } from '@/lib/documents/agreement'
import { scheduleCLines, type ScheduleSource } from '@/lib/documents/agreement-wording'

/**
 * Representative agreements for tests and for comparing the PDF with the Word
 * file. Every value is invented; none is a real customer.
 */

const STANDARD: ScheduleSource[] = [
  { code: 'AGREEMENT', label: '20% at the time of execution of the Agreement', amountPaise: 180000000n },
  { code: 'BASEMENT', label: '10% before casting of Basement slab', amountPaise: 90000000n },
  { code: 'GROUND', label: '10% before casting of Ground slab', amountPaise: 90000000n },
  ...[1, 2, 3, 4, 5].map((floor) => ({ code: `FLOOR_${floor}`, label: `6% floor ${floor}`, amountPaise: 54000000n })),
  ...[6, 7, 8, 9, 10].map((floor) => ({ code: `FLOOR_${floor}`, label: `5% floor ${floor}`, amountPaise: 45000000n })),
  { code: 'HANDOVER', label: '5% at the time of Handover/ Registry of flat', amountPaise: 45000000n },
]

const MEERA: AgreementParty = {
  salutation: 'Mrs.',
  name: 'Meera Kapoor',
  relationship: 'Husband',
  relativeName: 'Arjun Kapoor',
  occupation: 'Doctor',
  aadhaar: '123412341234',
  pan: 'ABCDE1234F',
  mobile: '9999999999',
  addressLines: ['14 Circular Road', 'Hindpiri', 'Ranchi, Jharkhand-834001'],
}

const ROHAN: AgreementParty = {
  salutation: 'Mr.',
  name: 'Rohan Kapoor',
  relationship: 'Father',
  relativeName: 'Arjun Kapoor',
  occupation: 'Business',
  aadhaar: '222233334444',
  pan: 'BCDEF2345G',
  mobile: '8888888888',
  addressLines: ['14 Circular Road', 'Ranchi, Jharkhand-834001'],
}

const LONG_PARTIES: AgreementParty[] = [
  {
    salutation: 'Dr.',
    name: 'Venkataraghavan Subramaniam Ramachandran Iyer',
    relationship: 'Father',
    relativeName: 'Subramaniam Ramachandran Krishnaswamy Iyer',
    occupation: 'Senior Consultant Cardiothoracic Surgeon',
    aadhaar: '987698769876',
    pan: 'PQRSV6789K',
    mobile: '9123456780',
    addressLines: [
      'Flat No. 1204, Tower B, Prestige Lakeside Habitat Residential Complex',
      'Near Varthur Kodi Junction, Whitefield Main Road, Gunjur Village',
      'Bengaluru Urban, Karnataka-560087',
    ],
  },
  {
    salutation: 'Mrs.',
    name: 'Annapoorani Lakshminarayanan Venkataraghavan',
    relationship: 'Husband',
    relativeName: 'Venkataraghavan Subramaniam Ramachandran Iyer',
    occupation: 'Professor of Economics',
    aadhaar: '876587658765',
    pan: 'LMNOP4321Q',
    mobile: '9988776655',
    addressLines: [
      'Flat No. 1204, Tower B, Prestige Lakeside Habitat Residential Complex',
      'Near Varthur Kodi Junction, Whitefield Main Road, Gunjur Village',
      'Bengaluru Urban, Karnataka-560087',
    ],
  },
  {
    salutation: 'Ms.',
    name: 'Kaveri Venkataraghavan',
    relationship: 'Father',
    relativeName: 'Venkataraghavan Subramaniam Ramachandran Iyer',
    occupation: 'Software Engineer',
    aadhaar: '765476547654',
    pan: 'TUVWX8765Z',
    mobile: '9090909090',
    addressLines: ['House No. 7, Lane 3, Ashok Nagar', 'Ranchi, Jharkhand-834002'],
  },
]

function custom(total: bigint, count: number): ScheduleSource[] {
  const share = total / BigInt(count)
  const rows: ScheduleSource[] = [{ code: 'AGREEMENT', label: 'At the time of execution of the Agreement', amountPaise: share }]
  for (let index = 1; index < count - 1; index += 1) {
    rows.push({ code: null, label: `Instalment ${index + 1} on completion of stage ${index} of the structure and associated finishing works`, date: `2027-${String(((index - 1) % 12) + 1).padStart(2, '0')}-15`, amountPaise: share })
  }
  rows.push({ code: 'HANDOVER', label: 'At the time of Handover/ Registry of flat', amountPaise: total - share * BigInt(count - 1) })
  return rows
}

export interface AgreementSample {
  id: string
  description: string
  input: AgreementDocumentInput
}

export function agreementSamples(): AgreementSample[] {
  const longTotal = 1234567850n
  return [
    {
      id: 'single-cheque',
      description: 'Single purchaser, standard schedule, cheque booking payment, one parking space',
      input: {
        executionDate: '2026-11-11',
        unitNo: '506',
        floorNo: '5',
        builtUp: '1175.7',
        superBuiltUp: '1528',
        landShare: '463',
        allotmentDate: '2026-11-06',
        parkingCount: 1,
        boundaries: { east: 'Open space of anandam', west: 'Flat no. 505', north: 'Open space of anandam', south: 'Flat no. 507' },
        considerationPaise: 900000000n,
        gstPaise: 45000000n,
        bookingPaidPaise: 50000000n,
        parties: [MEERA],
        payments: [{ payer: 'Mrs. Meera Kapoor', amountPaise: 50000000n, mode: 'Cheque', reference: '004512', date: '2026-11-01', bank: 'State Bank of India' }],
        finance: { scenario: 'purchaser', bankName: '', loanSanctioned: null },
        schedule: scheduleCLines(STANDARD, 50000000n).lines,
      },
    },
    {
      id: 'joint-bank-50-50',
      description: 'Two purchasers, 50:50 bank funding, NEFT payment, short custom schedule, two parking spaces',
      input: {
        executionDate: '2026-12-02',
        unitNo: '401',
        floorNo: '4',
        builtUp: '1387.1',
        superBuiltUp: '1803',
        landShare: '546',
        allotmentDate: '2026-11-20',
        parkingCount: 2,
        boundaries: { east: 'Flat no. 402', west: 'Open space of anandam', north: 'Flat no. 403', south: 'Open space of anandam' },
        considerationPaise: 1081800000n,
        gstPaise: 54090000n,
        bookingPaidPaise: 108180000n,
        parties: [MEERA, ROHAN],
        payments: [{ payer: 'Mr. Rohan Kapoor', amountPaise: 108180000n, mode: 'NEFT_RTGS', reference: 'HDFCN52026112045', date: '2026-11-20', bank: '' }],
        finance: { scenario: 'split_50_50', bankName: 'HDFC Bank Ltd.', loanSanctioned: true },
        schedule: scheduleCLines([
          { code: 'AGREEMENT', label: 'At the time of execution of the Agreement', amountPaise: 216360000n },
          { code: null, label: 'Second payment', date: '2027-04-01', amountPaise: 432720000n },
          { code: 'HANDOVER', label: 'At the time of Handover/ Registry of flat', amountPaise: 432720000n },
        ], 108180000n).lines,
      },
    },
    {
      id: 'three-long-custom',
      description: 'Three purchasers with long names and addresses, 10:90 loan not yet sanctioned, two payments, 24-row schedule',
      input: {
        executionDate: '2027-01-23',
        unitNo: '1002',
        floorNo: '10',
        builtUp: '1387.1',
        superBuiltUp: '1803',
        landShare: '546',
        allotmentDate: '2027-01-02',
        parkingCount: 3,
        boundaries: { east: 'Open space of anandam', west: 'Flat no. 1001', north: 'Open space of anandam', south: 'Flat no. 1003' },
        considerationPaise: longTotal,
        gstPaise: 61728393n,
        bookingPaidPaise: 30000000n,
        parties: LONG_PARTIES,
        payments: [
          { payer: 'Dr. Venkataraghavan Subramaniam Ramachandran Iyer', amountPaise: 20000000n, mode: 'Cheque', reference: '112233', date: '2027-01-02', bank: 'Canara Bank, Whitefield Branch' },
          { payer: 'Mrs. Annapoorani Lakshminarayanan Venkataraghavan', amountPaise: 10000000n, mode: 'UPI', reference: '402711223344', date: '2027-01-03' },
        ],
        finance: { scenario: 'split_10_90', bankName: 'State Bank of India, Main Branch, Ranchi', loanSanctioned: false },
        schedule: scheduleCLines(custom(longTotal, 24), 30000000n).lines,
      },
    },
    {
      id: 'unpaid-minimal',
      description: 'Single purchaser with details missing, nothing received yet, no parking recorded, two-line schedule',
      input: {
        executionDate: '2027-03-01',
        unitNo: '208',
        floorNo: '2',
        builtUp: '1175.7',
        superBuiltUp: '1528',
        landShare: '463',
        allotmentDate: '',
        parkingCount: 0,
        boundaries: { east: 'Open space of anandam', west: 'Flat no. 207', north: 'Open space of anandam', south: 'Flat no. 209' },
        considerationPaise: 750000000n,
        gstPaise: 37500000n,
        bookingPaidPaise: 0n,
        parties: [{ salutation: 'Mr.', name: 'Amit Kumar', relationship: '', relativeName: '', occupation: '', aadhaar: '', pan: '', mobile: '', addressLines: [] }],
        payments: [],
        finance: { scenario: 'purchaser', bankName: '', loanSanctioned: null },
        schedule: scheduleCLines([
          { code: 'AGREEMENT', label: '20% at the time of execution of the Agreement', amountPaise: 150000000n },
          { code: 'HANDOVER', label: '80% at the time of Handover/ Registry of flat', amountPaise: 600000000n },
        ], 0n).lines,
      },
    },
  ]
}
