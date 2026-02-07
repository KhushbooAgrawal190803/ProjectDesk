import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/get-user'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Users, UserCheck, UserX, Shield } from 'lucide-react'
import { getUserStats, getUsers, getSettings } from './actions'
import { UsersTable } from './users-table'
import { SettingsForm } from './settings-form'

export default async function AdminPage() {
  const profile = await requireRole(['ADMIN'])
  if (!profile) {
    redirect('/login')
  }

  const [stats, users, settings] = await Promise.all([
    getUserStats(),
    getUsers(),
    getSettings(),
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
                  <div className="font-semibold">{stats.staffCount}</div>
                  <div className="text-xs text-zinc-500">Staff</div>
                </div>
                <div className="w-px h-8 bg-zinc-200" />
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
        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="bg-white border border-zinc-200">
            <TabsTrigger value="users">User Management</TabsTrigger>
            <TabsTrigger value="settings">System Settings</TabsTrigger>
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
        </Tabs>
      </div>
    </DashboardLayout>
  )
}

