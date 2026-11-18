import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFRawStream, PDFArray, decodePDFRawStream } from 'pdf-lib'
import { RECEIVING_ACCOUNTS } from '@/lib/documents/receiving-accounts'
import { demandBlocks, demandIntro, priorDemandLines, snapshotFromStorage, snapshotForStorage, type DemandSnapshot } from '@/lib/documents/demand-model'
import { renderLetterPdf, STAMP_GAP_PT } from '@/lib/documents/letter-pdf'
import type { LetterBlock } from '@/lib/documents/letter-model'

function letterText(blocks: LetterBlock[]): string {
  return blocks.map((block) => {
    if (block.kind === 'line' || block.kind === 'paragraph') return block.text
    if (block.kind === 'table') return block.rows.map((row) => `${row.label} ${row.value}`).join('\n')
    if (block.kind === 'grid') return block.rows.map((row) => row.join(' ')).join('\n')
    return ''
  }).join('\n')
}

function snapshot(owner: DemandSnapshot['owner']): DemandSnapshot {
  return {
    referenceNumber: owner === 'DEVELOPER' ? 'LUB/ANANDAM/DN/506/001/2026' : 'LUB/ANANDAM/DN/702/001/2026',
    issueDate: owner === 'DEVELOPER' ? '2026-08-05' : '2026-11-09',
    paymentDeadline: '2026-11-16',
    paymentDays: 7,
    agreementDate: owner === 'DEVELOPER' ? '2026-07-29' : '2026-11-06',
    owner,
    unitNo: owner === 'DEVELOPER' ? '506' : '702',
    projectName: 'Anandam',
    applicantLines: owner === 'DEVELOPER'
      ? ['Miss Tanusree Dutta', 'C/o Ahindra Kumar Dutta', 'E-9 Anil Sur Path']
      : ['Dr. Bhagwan Singh & Mrs. Sunita Yadav', 'House No. 1C, First Floor'],
    milestoneLabel: 'Before casting of Basement slab',
    account: RECEIVING_ACCOUNTS[owner],
    propertyValuePaise: owner === 'DEVELOPER' ? 661200000n : 915240000n,
    installmentPaise: 132240000n,
    gstPaise: 6612000n,
    principalReceivedPaise: 0n,
    gstReceivedPaise: 0n,
    principalOutstandingPaise: 132240000n,
    gstOutstandingPaise: 6612000n,
  }
}

describe('demand note wording', () => {
  it('uses the developer agreement and the developer account', () => {
    const text = letterText(demandBlocks(snapshot('DEVELOPER')))
    expect(text).toContain('executed between LEVEL UP BUILDCON and you')
    expect(text).toContain('Flat No. 506')
    expect(text).toContain('44810040310')
    expect(text).not.toContain('Balaji')
    expect(text).toContain('within 7 (Seven) days')
    expect(text).toContain('Rs. 66,12,000.00')
  })

  it('uses the landowner agreement, the landowner sentence, and the landowner account', () => {
    const blocks = demandBlocks(snapshot('LANDOWNER'))
    const text = letterText(blocks)
    expect(demandIntro(snapshot('LANDOWNER')).join(' ')).toContain('raised on behalf of the Landowner')
    expect(text).toContain('BALAJI PROJECTS AND HOSPITALITY PRIVATE LIMITED')
    expect(text).toContain('36963431833')
    expect(text).toContain('Flat No. 702')
    expect(text).not.toContain('44810040310')
  })

  it('keeps parking inside the property value and outside the installment', () => {
    const note = snapshot('DEVELOPER')
    note.propertyValuePaise = 687600000n + 22500000n
    note.installmentPaise = 137520000n
    const text = letterText(demandBlocks(note))
    expect(text).toContain('Rs. 71,01,000.00')
    expect(text).toContain('Rs. 13,75,200.00')
    expect(text).not.toContain('parking')
  })

  it('asks for the unpaid balance of each earlier demand note, with its number and date', () => {
    const note = snapshot('DEVELOPER')
    note.priorBalances = [
      {
        referenceNumber: 'LUB/ANANDAM/DN/506/001/2026',
        issueDate: '2026-08-05',
        principalOutstandingPaise: 50000000n,
        gstOutstandingPaise: 2500000n,
      },
      {
        referenceNumber: 'LUB/ANANDAM/DN/506/002/2026',
        issueDate: '2026-09-01',
        principalOutstandingPaise: 0n,
        gstOutstandingPaise: 0n,
      },
    ]
    const text = letterText(demandBlocks(note))
    expect(text).toContain('Outstanding Amount Against Previous Demand Note')
    expect(text).toContain('We further wish to bring to your attention that an amount of Rs. 5,25,000.00 remains outstanding against our earlier Demand Note No. LUB/ANANDAM/DN/506/001/2026, dated 05.08.2026, after adjustment of payments received.')
    expect(text).toContain('You are hereby requested to clear the aforesaid outstanding amount along with the amount payable under the present Demand Note.')
    expect(text).not.toContain('DN/506/002/2026')
    expect(priorDemandLines(snapshotFromStorage(snapshotForStorage(note)).priorBalances)).toEqual(priorDemandLines(note.priorBalances))
  })

  it('leaves a payment statement about the one note it updates', () => {
    const note = snapshot('DEVELOPER')
    note.priorBalances = [{
      referenceNumber: 'LUB/ANANDAM/DN/506/001/2026',
      issueDate: '2026-08-05',
      principalOutstandingPaise: 100n,
      gstOutstandingPaise: 0n,
    }]
    const text = letterText(demandBlocks(note, { statement: true, statementDate: '2026-09-10' }))
    expect(text).not.toContain('You are also requested')
  })
})

describe('stamp space', () => {
  it('leaves about 50mm between For LEVEL UP BUILDCON and Partner', async () => {
    const bytes = await renderLetterPdf([
      { kind: 'paragraph', text: 'A short letter.' },
      { kind: 'signature', style: 'allotment' },
    ])
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBe(1)
    const contents = pdf.getPages()[0].node.Contents()
    const refs = contents instanceof PDFArray ? contents.asArray() : [contents]
    const raw = refs.map((ref) => {
      const stream = pdf.context.lookup(ref)
      if (!(stream instanceof PDFRawStream)) return ''
      return Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')
    }).join('\n')
    const pairs = [...raw.matchAll(/1 0 0 1 [\d.]+ ([\d.]+) Tm\s*<([0-9A-Fa-f]+)> Tj/g)]
    const textAt = (label: string) => Number(pairs.find((match) => Buffer.from(match[2], 'hex').toString('latin1') === label)?.[1])
    const forY = textAt('For LEVEL UP BUILDCON')
    const partnerY = textAt('Partner')
    expect(forY - partnerY).toBe(STAMP_GAP_PT)
    const millimetres = (forY - partnerY) * 25.4 / 72
    expect(millimetres).toBeGreaterThanOrEqual(45)
    expect(millimetres).toBeLessThanOrEqual(55)
  })

  it('keeps the company line and Partner on the same page', async () => {
    const filler = Array.from({ length: 28 }, () => ({
      kind: 'paragraph' as const,
      text: 'This paragraph fills the page so the signature block has to move as one piece.',
    }))
    const bytes = await renderLetterPdf([...filler, { kind: 'signature', style: 'demand' }])
    const pdf = await PDFDocument.load(bytes)
    const pages = pdf.getPages().map((page) => {
      const contents = page.node.Contents()
      const refs = contents instanceof PDFArray ? contents.asArray() : [contents]
      return refs.map((ref) => {
        const stream = pdf.context.lookup(ref)
        if (!(stream instanceof PDFRawStream)) return ''
        return Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')
      }).join('\n')
    })
    const hits = pages.map((raw) => ({
      company: raw.includes('<466F72204C4556454C205550204255494C44434F4E>'),
      partner: raw.includes('<506172746E6572>'),
    }))
    expect(hits.some((hit) => hit.company && hit.partner)).toBe(true)
    expect(hits.some((hit) => hit.company !== hit.partner)).toBe(false)
  })
})
