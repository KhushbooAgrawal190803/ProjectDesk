import type { OwnerType } from '@/lib/data/flat-ownership'

/**
 * Receiving accounts for allotment collections.
 * These are not the loan bank the NOC is addressed to.
 */
export interface ReceivingAccount {
  accountName: string
  accountNumber: string
  bank: string
  branch: string
  ifsc: string
}

export const RECEIVING_ACCOUNTS: Record<OwnerType, ReceivingAccount> = {
  DEVELOPER: {
    accountName: 'LEVEL UP BUILDCON',
    accountNumber: '44810040310',
    bank: 'STATE BANK OF INDIA',
    branch: 'SME BRANCH, Ranchi',
    ifsc: 'SBIN0009620',
  },
  LANDOWNER: {
    accountName: 'BALAJI PROJECTS AND HOSPITALITY PRIVATE LIMITED',
    accountNumber: '36963431833',
    bank: 'STATE BANK OF INDIA',
    branch: 'SME BRANCH, Ranchi',
    ifsc: 'SBIN0009620',
  },
}

export const CONSIDERATION_GST_PERCENT = 5

export function receivingAccountFor(owner: OwnerType): ReceivingAccount {
  return RECEIVING_ACCOUNTS[owner]
}
