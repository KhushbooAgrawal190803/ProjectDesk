'use client'

import { useLayoutEffect, useRef, type ComponentProps } from 'react'
import { Input } from '@/components/ui/input'

/** "1234567.5" -> "12,34,567.5": Indian grouping (last three digits, then pairs). Keeps a trailing "." while typing. */
export function formatIndianAmount(raw: string | number | null | undefined): string {
  const text = raw == null ? '' : String(raw)
  if (!text) return ''
  const negative = text.startsWith('-')
  const [whole = '', fraction] = text.replace(/^-/, '').split('.')
  const digits = whole.replace(/^0+(?=\d)/, '')
  const last = digits.slice(-3)
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  const grouped = rest ? `${rest},${last}` : last
  return `${negative ? '-' : ''}${grouped}${fraction !== undefined ? `.${fraction}` : ''}`
}

/** Whatever was typed or pasted, as a plain amount: digits and at most one "." with up to two decimals. */
export function parseAmountText(text: string): string {
  const cleaned = text.replace(/[^\d.]/g, '')
  const dot = cleaned.indexOf('.')
  if (dot < 0) return cleaned
  return `${cleaned.slice(0, dot)}.${cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2)}`
}

/** Where the caret goes in `display` so that `digits` digits (or ".") sit before it. */
export function caretAfterDigits(display: string, digits: number): number {
  let seen = 0
  let position = 0
  while (position < display.length && seen < digits) {
    if (/[\d.]/.test(display[position])) seen += 1
    position += 1
  }
  return position
}

/** How many digits (or ".") are before `caret` in `typed`. */
export function digitsBefore(typed: string, caret: number | null): number {
  return (typed.slice(0, caret ?? typed.length).match(/[\d.]/g) || []).length
}

type AmountInputProps = Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  /** The plain amount, e.g. "1234567.50" or 1234567.5. */
  value: string | number | null | undefined
  /** Receives the plain amount without commas, ready to save. */
  onValueChange: (value: string) => void
}

/**
 * A money box that shows Indian commas as you type (12,34,567.89) and hands back
 * the plain number, so nothing downstream has to strip commas.
 */
export function AmountInput({ value, onValueChange, ...props }: AmountInputProps) {
  const ref = useRef<HTMLInputElement>(null)
  // Digits (and ".") before the caret, so the caret stays put when commas move.
  const caretDigits = useRef<number | null>(null)
  const display = formatIndianAmount(value)

  useLayoutEffect(() => {
    const input = ref.current
    const wanted = caretDigits.current
    if (!input || wanted == null || document.activeElement !== input) return
    caretDigits.current = null
    const position = caretAfterDigits(display, wanted)
    input.setSelectionRange(position, position)
  })

  return (
    <Input
      {...props}
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={display}
      onChange={(event) => {
        const { value: typed, selectionStart } = event.target
        caretDigits.current = digitsBefore(typed, selectionStart)
        onValueChange(parseAmountText(typed))
      }}
    />
  )
}
