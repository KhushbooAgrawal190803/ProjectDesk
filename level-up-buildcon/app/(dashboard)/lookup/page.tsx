import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/get-user'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { LookupClient } from './lookup-client'
import { getTowerAllocations } from './tower-actions'

export default async function LookupPage() {
  const profile = await requireProfile()
  if (!profile) {
    redirect('/login')
  }

  const towerAllocations = await getTowerAllocations()

  return (
    <DashboardLayout profile={profile}>
      <LookupClient towerAllocations={towerAllocations} />
    </DashboardLayout>
  )
}
