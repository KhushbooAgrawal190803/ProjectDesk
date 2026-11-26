'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { DateField } from '@/components/ui/date-field'
import { formatInr } from '@/lib/booking/money'
import { formatLetterDate } from '@/lib/documents/inr-words'
import type { StatementRow } from '@/lib/ledger/statement'

export type StatementViewRow = Omit<StatementRow, 'principalPaise' | 'gstPaise' | 'totalPaise'> & {
  principal: string
  gst: string
  total: string
  /** A payment that is GST only, e.g. a separate GST cheque: the whole row is red. */
  gstOnly: boolean
}

const hasGst = (row: StatementViewRow) => Number(row.gst) > 0

export interface StatementViewData {
  title: string
  rows: StatementViewRow[]
  principal: string
  gst: string
  total: string
  payments: number
}

type OwnerKey = 'levelup' | 'balaji'

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function StatementView({
  from,
  to,
  owner,
  statements,
}: {
  from: string
  to: string
  owner: OwnerKey
  statements: Record<OwnerKey, StatementViewData>
}) {
  const router = useRouter()
  const [range, setRange] = useState({ from, to })
  const statement = statements[owner]
  const query = (next: Partial<{ from: string; to: string; owner: OwnerKey }>) => {
    const params = new URLSearchParams({ from, to, owner, ...next })
    return `/accounts/statement?${params.toString()}`
  }
  const period = `${formatLetterDate(from)} to ${formatLetterDate(to)}`

  const download = () => {
    const header = ['Date', 'Party', 'Mode', 'Cheque / UTR No.', 'Bank', 'Flat', 'Serial', 'Amount (excl. GST)', 'GST', 'Total']
    const lines = statement.rows.map((row) =>
      [
        formatLetterDate(row.date) || row.date,
        row.party,
        row.mode,
        row.reference || '',
        row.bank || '',
        row.flat,
        row.serial || '',
        row.principal,
        row.gst,
        row.total,
      ].map(csvCell).join(',')
    )
    const totals = [['', '', '', '', '', '', 'Total', statement.principal, statement.gst, statement.total]].map((cells) => cells.map(csvCell).join(','))
    const title = [`${statement.title} — Cash Statement`, period].map(csvCell)
    const csv = [title.join(','), '', header.join(','), ...lines, '', ...totals].join('\r\n')
    // A byte-order mark so Excel reads ₹ and names correctly.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${statement.title.replace(/\s+/g, '-')}-cash-statement-${from}-to-${to}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm print:hidden lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="statement-from">From</Label>
            <DateField id="statement-from" value={range.from} onChange={(value) => setRange((current) => ({ ...current, from: value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="statement-to">To</Label>
            <DateField id="statement-to" value={range.to} onChange={(value) => setRange((current) => ({ ...current, to: value }))} />
          </div>
          <Button
            onClick={() => router.push(query({ from: range.from || from, to: range.to || to }))}
            disabled={Boolean(range.from && range.to && range.from > range.to)}
          >
            Generate
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={download} disabled={!statement.rows.length}>
            <Download className="h-4 w-4" />
            Download (Excel)
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-zinc-200 print:hidden">
        {(['levelup', 'balaji'] as const).map((key) => (
          <Link
            key={key}
            href={query({ owner: key })}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${owner === key ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-900'}`}
          >
            {statements[key].title}
            <span className="ml-2 text-xs font-normal text-zinc-500">{formatInr(statements[key].total)}</span>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="text-xl font-semibold text-zinc-900">{statement.title} — Cash Statement</h2>
        <p className="text-sm text-zinc-500">
          {period} · {statement.payments} payment{statement.payments === 1 ? '' : 's'} received ·{' '}
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-200" /> GST in red</span>
          <span className="print:hidden"> · Click a row to open that booking&apos;s financials</span>
        </p>
      </div>

      {statement.rows.length === 0 ? (
        <p className="rounded-lg border border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-500">No money was received for {statement.title} in this period.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm print:overflow-visible print:border-0 print:shadow-none">
          <table className="w-full min-w-[900px] text-sm print:min-w-0 print:text-xs">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Party</th>
                <th className="px-3 py-2 font-medium">Mode</th>
                <th className="px-3 py-2 font-medium">Cheque / UTR No.</th>
                <th className="px-3 py-2 font-medium">Flat</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 text-right font-medium">GST</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {statement.rows.map((row) => (
                <tr
                  key={row.key}
                  onClick={() => router.push(`/bookings/${row.bookingId}?tab=financials`)}
                  title={`Open Flat ${row.flat}'s financials`}
                  className={`cursor-pointer ${row.gstOnly ? 'bg-red-50 text-red-700 hover:bg-red-100 print:bg-red-50' : 'hover:bg-zinc-50'}`}
                >
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatLetterDate(row.date)}</td>
                  <td className="px-3 py-2">{row.party}</td>
                  <td className="px-3 py-2">{row.mode}</td>
                  <td className="px-3 py-2">
                    {row.reference || '—'}
                    {row.bank && <div className={`text-xs ${row.gstOnly ? 'text-red-600' : 'text-zinc-500'}`}>{row.bank}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/bookings/${row.bookingId}?tab=financials`}
                      onClick={(event) => event.stopPropagation()}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {row.flat || '—'}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{Number(row.principal) > 0 ? formatInr(row.principal) : '—'}</td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${hasGst(row) ? 'font-medium text-red-700' : 'text-zinc-400'}`}>
                    {hasGst(row) ? formatInr(row.gst) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">{formatInr(row.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-zinc-200 text-sm font-semibold text-zinc-900">
              <tr>
                <td colSpan={5} className="px-3 py-2 text-right">Total received</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatInr(statement.principal)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-red-700">{formatInr(statement.gst)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatInr(statement.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
