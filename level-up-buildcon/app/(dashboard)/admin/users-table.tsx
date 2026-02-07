'use client'

import { useState } from 'react'
import { Profile, UserRole, UserStatus } from '@/lib/types/database'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MoreHorizontal, UserPlus, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { 
  approveUser, 
  changeUserRole, 
  changeUserStatus, 
  createUser,
  sendPasswordReset 
} from './actions'
import { format } from 'date-fns'

interface UsersTableProps {
  users: Profile[]
}

export function UsersTable({ users }: UsersTableProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null)
  const [newRole, setNewRole] = useState<UserRole>('STAFF')

  // Create user form state
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserName, setNewUserName] = useState('')
  const [newUserRole, setNewUserRole] = useState<UserRole>('STAFF')

  const handleApprove = async (userId: string) => {
    setLoading(userId)
    try {
      await approveUser(userId)
      toast.success('User approved')
    } catch (error) {
      toast.error('Failed to approve user')
    } finally {
      setLoading(null)
    }
  }

  const handleChangeRole = async () => {
    if (!selectedUser) return
    
    setLoading(selectedUser.id)
    try {
      await changeUserRole(selectedUser.id, newRole)
      toast.success('Role updated')
      setRoleDialogOpen(false)
    } catch (error) {
      toast.error('Failed to update role')
    } finally {
      setLoading(null)
    }
  }

  const handleDisable = async (userId: string, currentStatus: UserStatus) => {
    setLoading(userId)
    const newStatus: UserStatus = currentStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
    try {
      await changeUserStatus(userId, newStatus)
      toast.success(newStatus === 'DISABLED' ? 'User disabled' : 'User enabled')
    } catch (error) {
      toast.error('Failed to update status')
    } finally {
      setLoading(null)
    }
  }

  const handleSendReset = async (email: string) => {
    setLoading(email)
    try {
      await sendPasswordReset(email)
      toast.success('Password reset email sent')
    } catch (error) {
      toast.error('Failed to send reset email')
    } finally {
      setLoading(null)
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading('create')
    try {
      await createUser({
        email: newUserEmail,
        fullName: newUserName,
        role: newUserRole,
      })
      toast.success('User created', {
        description: 'Password reset email sent to user',
      })
      setCreateDialogOpen(false)
      setNewUserEmail('')
      setNewUserName('')
      setNewUserRole('STAFF')
    } catch (error: any) {
      toast.error('Failed to create user', {
        description: error.message,
      })
    } finally {
      setLoading(null)
    }
  }

  const getStatusBadge = (status: UserStatus) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="default" className="bg-green-600">Active</Badge>
      case 'PENDING':
        return <Badge variant="secondary">Pending</Badge>
      case 'DISABLED':
        return <Badge variant="destructive">Disabled</Badge>
    }
  }

  const getRoleBadge = (role: UserRole) => {
    const colors = {
      ADMIN: 'bg-purple-600 text-white',
      EXECUTIVE: 'bg-blue-600 text-white',
      STAFF: 'bg-zinc-600 text-white',
    }
    return <Badge className={colors[role]}>{role}</Badge>
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
            <UserPlus className="w-4 h-4" />
            Create User
          </Button>
        </div>

        <div className="border border-zinc-200 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-zinc-50">
                <TableHead className="font-semibold">Name</TableHead>
                <TableHead className="font-semibold">Email</TableHead>
                <TableHead className="font-semibold">Role</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Created</TableHead>
                <TableHead className="font-semibold">Last Login</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} className="hover:bg-zinc-50">
                  <TableCell className="font-medium">{user.full_name}</TableCell>
                  <TableCell className="text-zinc-600">{user.email}</TableCell>
                  <TableCell>{getRoleBadge(user.role)}</TableCell>
                  <TableCell>{getStatusBadge(user.status)}</TableCell>
                  <TableCell className="text-sm text-zinc-600">
                    {format(new Date(user.created_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-sm text-zinc-600">
                    {user.last_login 
                      ? format(new Date(user.last_login), 'MMM d, yyyy')
                      : 'Never'}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          disabled={loading === user.id}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {user.status === 'PENDING' && (
                          <DropdownMenuItem onClick={() => handleApprove(user.id)}>
                            Approve User
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => {
                          setSelectedUser(user)
                          setNewRole(user.role)
                          setRoleDialogOpen(true)
                        }}>
                          Change Role
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSendReset(user.email)}>
                          <Mail className="w-4 h-4 mr-2" />
                          Send Password Reset
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => handleDisable(user.id, user.status)}
                          className={user.status === 'ACTIVE' ? 'text-red-600' : 'text-green-600'}
                        >
                          {user.status === 'ACTIVE' ? 'Disable User' : 'Enable User'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create User Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>
              Create a new user account. A password reset email will be sent to the user.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateUser}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  required
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  required
                  placeholder="john@company.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as UserRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STAFF">Staff</SelectItem>
                    <SelectItem value="EXECUTIVE">Executive</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setCreateDialogOpen(false)}
                disabled={loading === 'create'}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading === 'create'}>
                {loading === 'create' ? 'Creating...' : 'Create User'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Change Role Dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change User Role</DialogTitle>
            <DialogDescription>
              Update role for {selectedUser?.full_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newRole">Role</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as UserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STAFF">Staff</SelectItem>
                  <SelectItem value="EXECUTIVE">Executive</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setRoleDialogOpen(false)}
              disabled={loading === selectedUser?.id}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleChangeRole}
              disabled={loading === selectedUser?.id}
            >
              {loading === selectedUser?.id ? 'Updating...' : 'Update Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

