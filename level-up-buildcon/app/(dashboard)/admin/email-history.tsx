import Link from 'next/link'
import { format } from 'date-fns'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmailEventStatusBadge } from '@/components/email/status-badges'
import { EVENT_TYPE_LABELS, type EventType } from '@/lib/email/core'

export interface HistoryRow {
  id: string
  event_type: string
  event_reference: string | null
  subject: string
  status: string
  document_count: number
  delivery_mode: string | null
  created_at: string
  last_error: string | null
  deliveries: Array<{ recipient_email: string; status: string }>
}

const MODE_LABELS: Record<string, string> = { attachments: 'PDFs attached', zip: 'ZIP attached', link: 'Secure link', none: 'No documents' }

export function EmailHistory({ rows, tablesReady }: { rows: HistoryRow[]; tablesReady: boolean }) {
  return (
    <Card className="border-zinc-200 shadow-sm">
      <CardHeader>
        <CardTitle>Email History</CardTitle>
        <CardDescription>Every email event, its documents and each recipient&apos;s delivery. Open one to retry failed recipients or resend.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {!tablesReady ? (
          <p className="px-6 pb-6 text-sm text-amber-800">Run supabase/migrations/011_email_delivery.sql first.</p>
        ) : rows.length === 0 ? (
          <p className="px-6 pb-8 text-center text-sm text-zinc-500">No emails yet. The first appears when a booking is finalized, a milestone is completed, or you send a test.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-4 py-3 font-medium">Subject</th>
                  <th className="px-4 py-3 text-right font-medium">Docs</th>
                  <th className="px-4 py-3 font-medium">Recipients</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((row) => {
                  const ok = row.deliveries.filter((item) => ['sent', 'delivered', 'delivery_delayed'].includes(item.status)).length
                  return (
                    <tr key={row.id} className="align-top hover:bg-zinc-50">
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-600">{format(new Date(row.created_at), 'd MMM yyyy, h:mm a')}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-zinc-900">{EVENT_TYPE_LABELS[row.event_type as EventType] || row.event_type}</p>
                        {row.event_reference && <p className="text-xs text-zinc-500">{row.event_reference}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {row.subject}
                        {row.last_error && <p className="mt-0.5 text-xs text-red-600">{row.last_error}</p>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.document_count}
                        {row.delivery_mode && <p className="text-xs text-zinc-500">{MODE_LABELS[row.delivery_mode] || row.delivery_mode}</p>}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">
                        {row.deliveries.length ? (
                          <>
                            <p className="text-xs">{row.deliveries.map((item) => item.recipient_email).join(', ')}</p>
                            <p className="text-xs text-zinc-400">{ok} of {row.deliveries.length} accepted</p>
                          </>
                        ) : (
                          <span className="text-xs">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3"><EmailEventStatusBadge status={row.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/email/${row.id}`} className="text-sm font-medium text-zinc-900 hover:underline">Details</Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
