'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Mail, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DELIVERY_STATUS_LABELS, type DeliveryStatus } from '@/lib/email/core'
import { addRecipient, removeRecipient, sendTestEmail, updateRecipient } from './email-actions'

interface Recipient {
  id: string
  email: string
  label: string | null
  is_active: boolean
}

export interface EmailPanelProps {
  tablesReady: boolean
  problems: string[]
  dailyLimit: number
  monthlyLimit: number
  sentToday: number
  sentThisMonth: number
  awaiting: number
  failing: number
  recipients: Recipient[]
}

export function EmailDeliveryPanel(props: EmailPanelProps) {
  const router = useRouter()
  const [newEmail, setNewEmail] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<Recipient | null>(null)
  const [removing, setRemoving] = useState<Recipient | null>(null)
  const [testTarget, setTestTarget] = useState('all')
  const [testResult, setTestResult] = useState<Array<{ recipient_email: string; status: string; last_error: string | null }> | null>(null)
  const active = props.recipients.filter((item) => item.is_active)
  const configured = props.tablesReady && props.problems.length === 0

  const act = async (key: string, work: () => Promise<unknown>, success: string) => {
    setBusy(key)
    try {
      await work()
      toast.success(success)
      router.refresh()
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong')
      return false
    } finally {
      setBusy(null)
    }
  }

  if (!props.tablesReady) {
    return (
      <Card className="border-amber-200 bg-amber-50 shadow-sm">
        <CardContent className="pt-6 text-sm text-amber-900">
          Email delivery needs its database tables. Run <span className="font-mono">supabase/migrations/011_email_delivery.sql</span> in the Supabase SQL editor, then reload this page.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="border-zinc-200 shadow-sm">
        <CardHeader>
          <CardTitle>Email Delivery</CardTitle>
          <CardDescription>Booking documents and demand notes are emailed only to the company addresses below. Purchasers, co-applicants and banks never receive automatic emails.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid max-w-md grid-cols-2 gap-3">
            <div className="rounded-lg border border-zinc-200 px-3 py-2">
              <p className="text-xs text-zinc-500">Today (IST)</p>
              <p className="font-semibold tabular-nums">{props.sentToday} / {props.dailyLimit}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 px-3 py-2">
              <p className="text-xs text-zinc-500">This month</p>
              <p className="font-semibold tabular-nums">{props.sentThisMonth} / {props.monthlyLimit}</p>
            </div>
          </div>
          {(props.awaiting > 0 || props.failing > 0) && (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {props.awaiting > 0 && `${props.awaiting} email${props.awaiting === 1 ? ' is' : 's are'} awaiting recipients. `}
              {props.failing > 0 && `${props.failing} email${props.failing === 1 ? '' : 's'} had failed deliveries. `}
              Open Email History to send or retry.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-zinc-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Company Email Recipients</CardTitle>
          <CardDescription>Every active address receives every automatic email and every bulk send. A new address receives future emails only.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={async (event) => {
              event.preventDefault()
              const ok = await act('add', () => addRecipient({ email: newEmail, label: newLabel }), 'Recipient added')
              if (ok) {
                setNewEmail('')
                setNewLabel('')
              }
            }}
          >
            <div className="min-w-64 flex-1 space-y-1.5">
              <Label htmlFor="new-recipient">Email address</Label>
              <Input id="new-recipient" type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} placeholder="accounts@levelupbuildcon.com" required />
            </div>
            <div className="w-56 space-y-1.5">
              <Label htmlFor="new-recipient-label">Label (optional)</Label>
              <Input id="new-recipient-label" value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder="Accounts" />
            </div>
            <Button type="submit" className="gap-2" disabled={busy === 'add'}>
              {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add recipient
            </Button>
          </form>

          {props.recipients.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500">No company recipients yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Address</th>
                    <th className="px-4 py-2 font-medium">Label</th>
                    <th className="px-4 py-2 font-medium">Active</th>
                    <th className="px-4 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {props.recipients.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-2 font-medium text-zinc-900">{item.email}</td>
                      <td className="px-4 py-2 text-zinc-600">{item.label || '—'}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={item.is_active}
                            disabled={busy === `toggle-${item.id}`}
                            onCheckedChange={(checked) => act(`toggle-${item.id}`, () => updateRecipient(item.id, { is_active: checked }), checked ? 'Recipient enabled' : 'Recipient disabled')}
                            aria-label={`Active: ${item.email}`}
                          />
                          <Badge variant="outline" className={item.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'text-zinc-500'}>{item.is_active ? 'Active' : 'Disabled'}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="inline-flex gap-1">
                          <Button variant="ghost" size="sm" className="gap-1" onClick={() => setEditing({ ...item })}><Pencil className="h-3.5 w-3.5" />Edit</Button>
                          <Button variant="ghost" size="sm" className="gap-1 text-red-600 hover:text-red-700" onClick={() => setRemoving(item)}><Trash2 className="h-3.5 w-3.5" />Remove</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-zinc-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Send a test email</CardTitle>
          <CardDescription>Sends a short message with no documents, so you can confirm the sender and the addresses work.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="test-target">Send to</Label>
              <select id="test-target" value={testTarget} onChange={(event) => setTestTarget(event.target.value)} className="flex h-10 min-w-72 rounded-lg border border-zinc-200 bg-white px-3 text-sm">
                <option value="all">All active recipients ({active.length})</option>
                {active.map((item) => <option key={item.id} value={item.email}>{item.email}</option>)}
              </select>
            </div>
            <Button
              className="gap-2"
              disabled={!configured || active.length === 0 || busy === 'test'}
              onClick={async () => {
                setBusy('test')
                setTestResult(null)
                try {
                  const result = await sendTestEmail(testTarget)
                  setTestResult(result.deliveries as typeof testResult)
                  const failed = result.deliveries.filter((item) => item.status === 'failed').length
                  if (failed) toast.error(`${failed} test email${failed === 1 ? '' : 's'} failed`)
                  else toast.success('Test email accepted by Resend')
                  router.refresh()
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'The test email could not be sent')
                } finally {
                  setBusy(null)
                }
              }}
            >
              {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Send test email
            </Button>
          </div>
          {testResult && (
            <ul className="space-y-1 text-sm">
              {testResult.map((item) => (
                <li key={item.recipient_email} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{item.recipient_email}</span>
                  <Badge variant="outline">{DELIVERY_STATUS_LABELS[item.status as DeliveryStatus] || item.status}</Badge>
                  {item.last_error && <span className="text-xs text-red-600">{item.last_error}</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={editing != null} onOpenChange={(open) => !open && setEditing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit recipient</AlertDialogTitle>
            <AlertDialogDescription>Past emails keep the address they were sent to.</AlertDialogDescription>
          </AlertDialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-email">Email address</Label>
                <Input id="edit-email" type="email" value={editing.email} onChange={(event) => setEditing({ ...editing, email: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-label">Label</Label>
                <Input id="edit-label" value={editing.label || ''} onChange={(event) => setEditing({ ...editing, label: event.target.value })} />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              disabled={busy === 'edit'}
              onClick={async () => {
                if (!editing) return
                const ok = await act('edit', () => updateRecipient(editing.id, { email: editing.email, label: editing.label || '' }), 'Recipient updated')
                if (ok) setEditing(null)
              }}
            >
              {busy === 'edit' ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={removing != null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.email}?</AlertDialogTitle>
            <AlertDialogDescription>This address stops receiving emails. Its past deliveries stay in Email History. To pause it instead, switch it off.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-3">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy === 'remove'}
              onClick={async () => {
                if (!removing) return
                const ok = await act('remove', () => removeRecipient(removing.id), 'Recipient removed')
                if (ok) setRemoving(null)
              }}
            >
              {busy === 'remove' ? 'Removing…' : 'Remove'}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
