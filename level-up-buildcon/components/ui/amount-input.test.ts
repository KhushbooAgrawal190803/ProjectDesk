import { describe, expect, it } from 'vitest'
import { caretAfterDigits, digitsBefore, formatIndianAmount, parseAmountText } from './amount-input'

describe('Indian amount formatting', () => {
  it('groups the last three digits, then pairs', () => {
    expect(formatIndianAmount('1000')).toBe('1,000')
    expect(formatIndianAmount('100000')).toBe('1,00,000')
    expect(formatIndianAmount('4736800')).toBe('47,36,800')
    expect(formatIndianAmount('91524000.5')).toBe('9,15,24,000.5')
    expect(formatIndianAmount(123456789012)).toBe('1,23,45,67,89,012')
    expect(formatIndianAmount('999')).toBe('999')
  })
  it('keeps what is mid-typing and leaves blanks blank', () => {
    expect(formatIndianAmount('12345.')).toBe('12,345.')
    expect(formatIndianAmount('0.5')).toBe('0.5')
    expect(formatIndianAmount('')).toBe('')
    expect(formatIndianAmount(undefined)).toBe('')
  })
  it('reads typed or pasted text back as a plain amount', () => {
    expect(parseAmountText('47,36,800')).toBe('4736800')
    expect(parseAmountText('₹ 1,00,000.509')).toBe('100000.50')
    expect(parseAmountText('1.2.3')).toBe('1.23')
    expect(parseAmountText('abc')).toBe('')
  })
})

describe('caret while typing', () => {
  // Simulates one keystroke: the browser's raw text and caret, then the reformatted box.
  const type = (display: string, caret: number, key: string) => {
    const typed = display.slice(0, caret) + key + display.slice(caret)
    const digits = digitsBefore(typed, caret + key.length)
    const next = formatIndianAmount(parseAmountText(typed))
    return { next, caret: caretAfterDigits(next, digits) }
  }
  it('stays after the digit just typed when a comma appears', () => {
    expect(type('99,999', 6, '9')).toEqual({ next: '9,99,999', caret: 8 })
    expect(type('1,000', 5, '0')).toEqual({ next: '10,000', caret: 6 })
  })
  it('stays in place when typing in the middle', () => {
    // 1,000 -> insert 5 after the first 1 -> 15,000 with the caret after the 5
    expect(type('1,000', 1, '5')).toEqual({ next: '15,000', caret: 2 })
  })
  it('handles deleting a digit that removes a comma', () => {
    const typed = '1,00,00' // the user deleted the last 0 of 1,00,000
    const next = formatIndianAmount(parseAmountText(typed))
    expect(next).toBe('10,000')
    expect(caretAfterDigits(next, digitsBefore(typed, typed.length))).toBe(next.length)
  })
})
