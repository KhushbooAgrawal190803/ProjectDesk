import { describe, expect, it } from 'vitest'
import { buildLetter, letterPlainText, type LetterSource } from '@/lib/documents/letter-model'
import { formatRs, rupeesInWords } from '@/lib/documents/inr-words'
import { RECEIVING_ACCOUNTS } from '@/lib/documents/receiving-accounts'
import { generateBookingLetter } from '@/lib/documents/letter-pdf'

const boundaries = {
  boundary_east: 'Open Space of ANANDAM',
  boundary_west: 'Flat No. 505',
  boundary_north: 'Open Space of ANANDAM',
  boundary_south: 'Flat No. 507',
}

function developer(overrides: Partial<LetterSource> = {}): LetterSource {
  return {
    unit_no: '506',
    unit_type: 'Flat',
    project_name: 'ANANDAM',
    project_location: 'Ranchi, Jharkhand',
    project_address: 'PLOT NO 1089 KHATA NO 74, GUTUWA NAGRI RANCHI JHARKHAND',
    applicant_salutation: 'Miss',
    applicant_name: 'Tanusree Dutta',
    applicant_father_or_spouse: 'Ahindra Kumar Dutta',
    applicant_address: 'E-9 Anil Sur Path\nKadma, East Singhbhum',
    basic_sale_price: 6612000,
    total_parking_charges: 0,
    booking_amount_paid: 1322400,
    gst_collected: 66120,
    allotment_date: '2026-07-30',
    agreement_for_sale_date: '2026-07-29',
    noc_required: true,
    noc_addressee: 'The Branch Manager',
    noc_bank_name: 'Canara Bank',
    noc_bank_address: 'Main Road\nRanchi, Jharkhand 834001',
    ...boundaries,
    ...overrides,
  }
}

function landowner(overrides: Partial<LetterSource> = {}): LetterSource {
  return developer({
    unit_no: '702',
    applicant_salutation: 'Dr.',
    applicant_name: 'Bhagwan Singh',
    applicant_father_or_spouse: 'Suresh Singh',
    coapplicants: [{ salutation: 'Mrs.', name: 'Sunita Yadav', address: 'House No. 1C, Ashok Nagar\nRanchi, Jharkhand 834002' }],
    basic_sale_price: 9000000,
    total_parking_charges: 152400,
    booking_amount_paid: 192000,
    gst_collected: 0,
    allotment_date: '2026-11-06',
    agreement_for_sale_date: '2026-11-01',
    noc_bank_name: 'Bank of India',
    boundary_west: 'Flat No. 701',
    boundary_north: 'Daladali Road',
    boundary_south: 'Flat No. 703',
    ...overrides,
  })
}

describe('rupees in words', () => {
  it('uses lakhs and crores and does not round 91,52,400 up to ninety-two lakhs', () => {
    expect(rupeesInWords(915240000n)).toBe('Rupees Ninety-One Lakhs Fifty-Two Thousand Four Hundred only')
    expect(formatRs(661200000n)).toBe('Rs. 66,12,000.00')
    expect(rupeesInWords(33060000n)).toBe('Rupees Three Lakhs Thirty Thousand Six Hundred only')
  })
})

describe('allotment letters', () => {
  it('keeps the developer wording and shows GST collected separately from GST on the price', () => {
    const letter = buildLetter(developer(), 'allotment')
    const text = letterPlainText(letter)
    expect(letter.issues).toEqual([])
    expect(letter.owner).toBe('DEVELOPER')
    expect(text).toContain('Dated: 30.07.2026')
    expect(text).toContain('Dear Madam,')
    expect(text).toContain('Miss Tanusree Dutta')
    expect(text).toContain('C/o Ahindra Kumar Dutta')
    expect(text).toContain('Flat No. 506')
    expect(text).not.toContain('Flat No. Flat No.')
    expect(text).toContain('Rs. 66,12,000.00')
    expect(text).toContain('Rs. 3,30,600.00')
    expect(text).toContain('& GST amount Rs. 66,120.00')
    expect(text).not.toContain('parking')
    expect(text).not.toContain('Balaji Projects')
    expect(text).toContain('Boundaries of the Flat:')
    expect(text).toContain('For LEVEL UP BUILDCON')
  })

  it('adds the landowner share paragraph and does not say GST was paid when none was collected', () => {
    const text = letterPlainText(buildLetter(landowner(), 'allotment'))
    expect(text).toContain('from the share & on behalf of the Land owner M/s Balaji Projects and Hospitality Private Limited')
    expect(text).toContain('The total cost of the Flat No. 702 is Rs. 91,52,400.00')
    expect(text).toContain('GST amounts to Rs. 4,57,620.00')
    expect(text).toContain('You have paid Rs. 1,92,000.00')
    expect(text).not.toContain('& GST amount')
    expect(text).not.toContain('including GST')
    expect(text).toContain('Dr. Bhagwan Singh')
    expect(text).toContain('Mrs. Sunita Yadav')
    expect(text).toContain('Dear Sir/Madam,')
    expect(text).toContain('Boundaries of the Flat:')
    expect(text).not.toContain('Shop No.')
  })

  it('refuses to invent an allotment date or a missing boundary', () => {
    const letter = buildLetter(developer({ allotment_date: null, boundary_east: '' }), 'allotment')
    expect(letter.blocks).toEqual([])
    expect(letter.issues.join(' ')).toContain('Allotment date')
    expect(letter.issues.join(' ')).toContain('East')
  })
})

describe('NOC letters', () => {
  it('uses the loan bank in clauses 4 and 6 and the developer receiving account', () => {
    const text = letterPlainText(buildLetter(developer(), 'noc'))
    expect(text).toContain('Dated: 30.07.2026')
    expect(text).toContain('agreement for sale dated 29.07.2026')
    expect(text).toContain('to Canara Bank (herein after referred to as "the Bank")')
    expect(text).toContain('in favour of Canara Bank and upon receipt')
    expect(text).not.toContain('Flat No. Flat No.')
    expect(text).toContain(`Account Name: ${RECEIVING_ACCOUNTS.DEVELOPER.accountName}`)
    expect(text).toContain(RECEIVING_ACCOUNTS.DEVELOPER.accountNumber)
    expect(text).not.toContain(RECEIVING_ACCOUNTS.LANDOWNER.accountNumber)
    expect(text).toContain('PLOT NO 1089 KHATA NO 74')
  })

  it('uses the landowner receiving account and the entered loan bank, not a copied bank name', () => {
    const text = letterPlainText(buildLetter(landowner(), 'noc'))
    expect(text).toContain('to Bank of India (herein after referred to as "the Bank")')
    expect(text).toContain('in favour of Bank of India and upon receipt')
    expect(text).not.toContain('Canara Bank')
    expect(text).toContain(`Account Name: ${RECEIVING_ACCOUNTS.LANDOWNER.accountName}`)
    expect(text).toContain(RECEIVING_ACCOUNTS.LANDOWNER.accountNumber)
    expect(text).toContain('agreement for sale dated 01.11.2026')
    expect(text).not.toContain('dated 06.11.2026 and applicable')
  })

  it('does not generate a NOC without an agreement date or when NOC was not requested', () => {
    const missing = buildLetter(developer({ agreement_for_sale_date: '' }), 'noc')
    expect(missing.blocks).toEqual([])
    expect(missing.issues.join(' ')).toContain('Agreement for Sale date')
    expect(letterPlainText(missing)).not.toContain('dated')

    const declined = buildLetter(developer({ noc_required: false }), 'noc')
    expect(declined.issues.join(' ')).toContain('was not requested')
  })
})

describe('purchaser count and addresses', () => {
  const neha = { salutation: 'Mrs.', name: 'Neha Sharma', address: 'B-7, Lalpur Heights\nLalpur\nRanchi, Jharkhand 834001\nIndia' }
  const rohitElsewhere = { salutation: 'Mr.', name: 'Rohit Sharma', address: 'Flat 3A, Silver Oak\nBistupur\nJamshedpur, Jharkhand 831001\nIndia' }
  const rohitSame = { ...rohitElsewhere, address: neha.address }
  const kavya = {
    salutation: 'Dr.',
    name: 'Kavya Sharma',
    address: 'House No. 1C, First Floor, Sitaram Bhavan, Road No. 1, Gate No. 1, Ashok Nagar Colony\nArgora\nRanchi, Jharkhand 834002\nIndia',
  }
  const pair = (co: typeof rohitElsewhere[]) =>
    developer({
      applicant_salutation: neha.salutation,
      applicant_name: neha.name,
      applicant_address: neha.address,
      applicant_father_or_spouse: 'Rohit Sharma',
      coapplicants: co,
    })

  it('uses singular wording in the NOC for one purchaser', () => {
    const text = letterPlainText(buildLetter(developer(), 'noc'))
    expect(text).toContain('This is to certify that Miss Tanusree Dutta, hereinafter referred to as the Purchaser, has been allotted')
    expect(text).not.toContain('the Purchasers')
    expect(text).toContain("at the purchaser's own costs")
    expect(text).toContain('request of the Purchaser/Allottee')
    expect(text).toContain('Purchaser Miss Tanusree Dutta')
  })

  it('uses plural wording in the NOC for two purchasers', () => {
    const text = letterPlainText(buildLetter(pair([rohitElsewhere]), 'noc'))
    expect(text).toContain('This is to certify that Mrs. Neha Sharma and Mr. Rohit Sharma, hereinafter referred to as the Purchasers, have been allotted')
    expect(text).not.toContain('the Purchaser,')
    expect(text).not.toContain('has been allotted')
    expect(text).toContain('to the purchasers, at their own costs')
    expect(text).toContain('from the purchasers and/or the Bank')
    expect(text).toContain('from the above-named purchasers')
    expect(text).toContain('request of the Purchasers/Allottees')
    expect(text).toContain('Purchasers Mrs. Neha Sharma and Mr. Rohit Sharma')
  })

  it('lists three purchasers in entry order with plural wording', () => {
    const text = letterPlainText(buildLetter(pair([rohitElsewhere, kavya]), 'noc'))
    expect(text).toContain('Mrs. Neha Sharma, Mr. Rohit Sharma and Dr. Kavya Sharma, hereinafter referred to as the Purchasers, have been allotted')
  })

  it('prints each applicant with their own different address in the allotment letter', () => {
    const text = letterPlainText(buildLetter(pair([rohitElsewhere]), 'allotment'))
    const nehaAt = text.indexOf('Mrs. Neha Sharma')
    const rohitAt = text.indexOf('Mr. Rohit Sharma')
    expect(text.slice(nehaAt, rohitAt)).toContain('B-7, Lalpur Heights')
    expect(text.slice(rohitAt)).toContain('Flat 3A, Silver Oak')
    expect(text.slice(rohitAt)).toContain('Jamshedpur, Jharkhand 831001')
    expect(text.slice(rohitAt)).not.toContain('B-7, Lalpur Heights')
  })

  it('repeats a genuinely shared address under both names', () => {
    const text = letterPlainText(buildLetter(pair([rohitSame]), 'allotment'))
    expect(text.split('B-7, Lalpur Heights').length - 1).toBe(2)
  })

  it('prints three applicants, each with a long multiline address', () => {
    const text = letterPlainText(buildLetter(pair([rohitElsewhere, kavya]), 'allotment'))
    expect(text).toContain('Dr. Kavya Sharma')
    expect(text).toContain('Sitaram Bhavan, Road No. 1')
    expect(text).toContain('Argora')
    expect(text).toContain('Flat 3A, Silver Oak')
  })

  it('uses a co-applicant’s own address lines when the formatted address was not saved', () => {
    const text = letterPlainText(
      buildLetter(
        pair([{ salutation: 'Mr.', name: 'Rohit Sharma', address: '', address_line1: 'Flat 3A, Silver Oak', city: 'Jamshedpur', state: 'Jharkhand', pin_code: '831001' } as typeof rohitElsewhere]),
        'allotment'
      )
    )
    const rohitAt = text.indexOf('Mr. Rohit Sharma')
    expect(text.slice(rohitAt)).toContain('Flat 3A, Silver Oak')
    expect(text.slice(rohitAt)).toContain('Jamshedpur, Jharkhand 831001')
    expect(text.slice(rohitAt)).not.toContain('B-7, Lalpur Heights')
  })

  it('refuses to borrow the primary address when a co-applicant has none', () => {
    const letter = buildLetter(pair([{ salutation: 'Mr.', name: 'Rohit Sharma', address: '' }]), 'allotment')
    expect(letter.blocks).toEqual([])
    expect(letter.issues.join(' ')).toContain('Address is not recorded for Mr. Rohit Sharma')
  })

  it('renders the three-applicant letter and plural NOC as PDFs', async () => {
    const files = await Promise.all([
      generateBookingLetter(pair([rohitElsewhere, kavya]), 'allotment'),
      generateBookingLetter(pair([rohitElsewhere]), 'noc'),
    ])
    for (const file of files) expect(file.subarray(0, 5).toString()).toBe('%PDF-')
  })
})

describe('letter pdf', () => {
  it('renders developer and landowner letters, including a long name, through the same pipeline', async () => {
    const long = developer({
      applicant_name: 'A Very Long Applicant Name That Must Wrap Inside The Margin Without Overlapping The Next Line',
      applicant_address: 'House No. 1C, First Floor, Sitaram Bhavan, Road No. 1, Gate No. 1, Ashok Nagar Colony\nArgora, Ranchi-834002, Jharkhand',
    })
    const files = await Promise.all([
      generateBookingLetter(developer(), 'allotment'),
      generateBookingLetter(developer(), 'noc'),
      generateBookingLetter(landowner(), 'allotment'),
      generateBookingLetter(landowner(), 'noc'),
      generateBookingLetter(long, 'allotment'),
    ])
    for (const file of files) {
      expect(file.subarray(0, 5).toString()).toBe('%PDF-')
      expect(file.length).toBeGreaterThan(20_000)
    }
  })
})
