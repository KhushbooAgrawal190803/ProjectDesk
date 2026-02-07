import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/get-user'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { LookupClient } from './lookup-client'

export default async function LookupPage() {
  const profile = await requireProfile()
  if (!profile) {
    redirect('/login')
  }

  return (
    <DashboardLayout profile={profile}>
      <LookupClient />
    </DashboardLayout>
  )
}
