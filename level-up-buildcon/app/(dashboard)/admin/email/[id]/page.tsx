import Link from 'next/link'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { requireAdminPage } from '@/lib/auth/get-user'
import { createServiceClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmailDeliveryStatusBadge, EmailEventStatusBadge } from '@/components/email/status-badges'
import { EVENT_TYPE_LABELS, type EventType } from '@/lib/email/core'
import { loadEmailEvent } from '@/lib/email/admin-data'
import { EventActions } from './event-actions'

export const dynamic = 'force-dynamic'

const MODE_LABELS: Record<string, string> = {
  attachments: 'Each document attached as a PDF',
  zip: 'One ZIP attachment, organised into folders',
  link: 'Secure, expiring download link (too large to attach)',
  none: 'No documents',
}

const when = (value?: string | null) => (value ? format(new Date(value), 'd MMM yyyy, h:mm:ss a') : '—')

export default async function EmailEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await requireAdminPage()
  const service = await createServiceClient()
  const detail = await loadEmailEvent(service, id)
  if (!detail) notFound()
  const { event, documents, deliveries, attempts } = detail
  const { data: active } = await service.from('company_email_recipients').select('email').eq('is_active', true).order('email')
  const template = (event.payload as { template?: { omitted?: Array<{ name: string; reason: string }> } })?.template
  const failed = deliveries.filter((item) => item.status === 'failed' || item.status === 'bounced').length

  return (
    <DashboardLayout profile={profile}>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <Link href="/admin?tab=email-history" className="text-sm text-zinc-500 hover:text-zinc-900">← Email History</Link>
            <h1 className="text-2xl font-semibold text-zinc-900">{event.subject}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
              <EmailEventStatusBadge status={event.status} />
              <span>{EVENT_TYPE_LABELS[event.event_type as EventType] || event.event_type}</span>
              {event.event_reference && <span>· {event.event_reference}</span>}
              <span>· {when(event.created_at)}</span>
              {event.resend_of && <Link href={`/admin/email/${event.resend_of}`} className="underline">Resend of an earlier email</Link>}
            </div>
          </div>
          <EventActions eventId={event.id} failedCount={failed} awaiting={event.status === 'awaiting_recipients'} activeRecipients={(active || []).map((row) => row.email as string)} />
        </div>

        {event.last_error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{event.last_error}</p>}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="border-zinc-200 shadow-sm"><CardContent className="px-5 py-4"><p className="text-xs text-zinc-500">Documents</p><p className="text-lg font-semibold">{event.document_count}</p></CardContent></Card>
          <Card className="border-zinc-200 shadow-sm"><CardContent className="px-5 py-4"><p className="text-xs text-zinc-500">Delivery</p><p className="text-sm font-medium">{event.delivery_mode ? MODE_LABELS[event.delivery_mode] : 'Not prepared yet'}</p>{event.package_bytes ? <p className="text-xs text-zinc-500">{(Number(event.package_bytes) / 1024 / 1024).toFixed(2)} MB</p> : null}</CardContent></Card>
          <Card className="border-zinc-200 shadow-sm"><CardContent className="px-5 py-4"><p className="text-xs text-zinc-500">Completed</p><p className="text-sm font-medium">{when(event.completed_at)}</p>{event.package_expires_at && <p className="text-xs text-zinc-500">Link expires {when(event.package_expires_at)}</p>}</CardContent></Card>
        </div>

        <Card className="border-zinc-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">Recipients ({deliveries.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            {deliveries.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-zinc-500">No company recipients were active when this email was created.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Recipient</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Attempts</th>
                      <th className="px-4 py-2 font-medium">Resend message id</th>
                      <th className="px-4 py-2 font-medium">Sent / delivered</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 align-top">
                    {deliveries.map((delivery) => (
                      <tr key={delivery.id}>
                        <td className="px-4 py-2 font-medium">{delivery.recipient_email}</td>
                        <td className="px-4 py-2">
                          <EmailDeliveryStatusBadge status={delivery.status} />
                          {delivery.last_error && <p className="mt-1 max-w-xs text-xs text-red-600">{delivery.last_error}</p>}
                          {delivery.status === 'queued' && delivery.next_attempt_at && <p className="mt-1 text-xs text-zinc-500">Next try {when(delivery.next_attempt_at)}</p>}
                        </td>
                        <td className="px-4 py-2 tabular-nums">{delivery.attempt_count}</td>
                        <td className="px-4 py-2 font-mono text-xs">{delivery.provider_message_id || '—'}</td>
                        <td className="px-4 py-2 text-xs text-zinc-600">
                          {when(delivery.sent_at)}
                          {delivery.delivered_at && <div>Delivered {when(delivery.delivered_at)}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="px-4 py-3 text-xs text-zinc-500">“Accepted by Resend” means Resend took the message. “Delivered” appears only when Resend’s webhook confirms it reached the mailbox.</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">Documents ({documents.length})</CardTitle></CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <p className="text-sm text-zinc-500">No documents in this email.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {documents.map((doc) => (
                  <li key={doc.id} className="flex flex-wrap justify-between gap-2 border-b border-zinc-100 py-1.5 last:border-0">
                    <span>
                      <span className="text-zinc-500">{doc.folder} / </span>
                      {doc.file_name || 'Prepared when sent'}
                    </span>
                    {doc.file_bytes ? <span className="text-xs text-zinc-500">{(Number(doc.file_bytes) / 1024).toFixed(0)} KB</span> : null}
                  </li>
                ))}
              </ul>
            )}
            {template?.omitted?.length ? (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <p className="font-medium">Not included (stated in the email)</p>
                <ul className="mt-1 list-disc pl-5">
                  {template.omitted.map((item) => <li key={item.name}>{item.name}: {item.reason}</li>)}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">Delivery attempts</CardTitle></CardHeader>
          <CardContent>
            {attempts.length === 0 ? (
              <p className="text-sm text-zinc-500">No attempts yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {attempts.map((attempt) => {
                  const recipient = deliveries.find((item) => item.id === attempt.delivery_id)?.recipient_email
                  return (
                    <li key={attempt.id} className="flex flex-wrap gap-2 border-b border-zinc-100 py-1.5 last:border-0">
                      <span className="text-zinc-500">{when(attempt.attempted_at)}</span>
                      <span className="font-medium">{recipient}</span>
                      <span>attempt {attempt.attempt_number}: {attempt.outcome.replace(/_/g, ' ')}</span>
                      {attempt.provider_message_id && <span className="font-mono text-xs text-zinc-500">{attempt.provider_message_id}</span>}
                      {attempt.error && <span className="text-xs text-red-600">{attempt.error}</span>}
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
