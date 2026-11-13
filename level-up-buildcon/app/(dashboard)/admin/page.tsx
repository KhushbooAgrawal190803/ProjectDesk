import { redirect } from 'next/navigation'
import { requireAdminPage } from '@/lib/auth/get-user'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Users, UserCheck, UserX, Shield } from 'lucide-react'
import { getUserStats, getUsers, getSettings } from './actions'
import { UsersTable } from './users-table'
import { SettingsForm } from './settings-form'
import { createServiceClient } from '@/lib/supabase/server'
import { loadEmailHistory, loadEmailOverview } from '@/lib/email/admin-data'
import { EmailDeliveryPanel } from './email-delivery-panel'
import { EmailHistory, type HistoryRow } from './email-history'

export const dynamic = 'force-dynamic'

const TABS = ['users', 'settings', 'email', 'email-history']

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const profile = await requireAdminPage()
  if (!profile) {
    redirect('/login')
  }
  const { tab } = await searchParams
  const initialTab = TABS.includes(tab || '') ? (tab as string) : 'users'

  const service = await createServiceClient()
  const [stats, users, settings, email, history] = await Promise.all([
    getUserStats(),
    getUsers(),
    getSettings(),
    loadEmailOverview(service),
    loadEmailHistory(service),
  ])

  return (
    <DashboardLayout profile={profile}>
      <div className="space-y-8">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-semibold text-zinc-900">Admin Dashboard</h1>
          <p className="text-zinc-600 mt-1">Manage users and system settings</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="border-zinc-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-zinc-600">
                Total Users
              </CardTitle>
              <Users className="w-4 h-4 text-zinc-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{stats.totalUsers}</div>
              <p className="text-xs text-zinc-500 mt-1">All accounts</p>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-zinc-600">
                Active Users
              </CardTitle>
              <UserCheck className="w-4 h-4 text-zinc-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{stats.activeUsers}</div>
              <p className="text-xs text-zinc-500 mt-1">Can access system</p>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-zinc-600">
                Pending Approval
              </CardTitle>
              <UserX className="w-4 h-4 text-zinc-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{stats.pendingUsers}</div>
              <p className="text-xs text-zinc-500 mt-1">Awaiting review</p>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-zinc-600">
                Role Breakdown
              </CardTitle>
              <Shield className="w-4 h-4 text-zinc-400" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 text-sm">
                <div>
                  <div className="font-semibold">{stats.executiveCount}</div>
                  <div className="text-xs text-zinc-500">Exec</div>
                </div>
                <div className="w-px h-8 bg-zinc-200" />
                <div>
                  <div className="font-semibold">{stats.adminCount}</div>
                  <div className="text-xs text-zinc-500">Admin</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue={initialTab} className="space-y-6">
          <TabsList className="bg-white border border-zinc-200">
            <TabsTrigger value="users">User Management</TabsTrigger>
            <TabsTrigger value="settings">System Settings</TabsTrigger>
            <TabsTrigger value="email">Email Delivery</TabsTrigger>
            <TabsTrigger value="email-history">Email History</TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card className="border-zinc-200 shadow-sm">
              <CardHeader>
                <CardTitle>Users</CardTitle>
                <CardDescription>
                  Manage user accounts, roles, and permissions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UsersTable users={users} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <Card className="border-zinc-200 shadow-sm">
              <CardHeader>
                <CardTitle>System Settings</CardTitle>
                <CardDescription>
                  Configure application-wide settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SettingsForm settings={settings} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="email">
            <EmailDeliveryPanel
              tablesReady={email.tablesReady}
              problems={email.problems}
              dailyLimit={email.config.dailyLimit}
              monthlyLimit={email.config.monthlyLimit}
              sentToday={email.sentToday}
              sentThisMonth={email.sentThisMonth}
              awaiting={email.awaiting}
              failing={email.failing}
              recipients={email.recipients}
            />
          </TabsContent>

          <TabsContent value="email-history">
            <EmailHistory rows={history as HistoryRow[]} tablesReady={email.tablesReady} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  )
}


// Document generation and the background email after a save can take longer than the default limit.
export const maxDuration = 300
