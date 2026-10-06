'use client'

import React, { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  LayoutDashboard,
  FileText,
  Search,
  Download,
  Settings,
  LogOut,
  UserCog,
  PlusCircle,
  Trash2,
  Wallet,
} from 'lucide-react'
import { Profile } from '@/lib/types/database'
import { toast } from 'sonner'
import NProgress from 'nprogress'
import { AnandamLogo } from '@/components/brand/anandam-logo'
import { cn } from '@/lib/utils'

interface DashboardLayoutProps {
  children: ReactNode
  profile: Profile
}

export function DashboardLayout({ children, profile }: DashboardLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()

  React.useEffect(() => {
    NProgress.configure({
      showSpinner: false,
      trickleSpeed: 100,
      minimum: 0.08,
      easing: 'ease',
      speed: 200,
    })
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    sessionStorage.removeItem('lubc_tab')
    await supabase.auth.signOut()
    toast.success('Signed out successfully')
    router.push('/login')
    router.refresh()
  }

  const allNavItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['EXECUTIVE', 'ADMIN'] },
    { href: '/new-booking', label: 'New Booking', icon: PlusCircle, roles: ['EXECUTIVE', 'ADMIN'] },
    { href: '/bookings', label: 'All Bookings', icon: FileText, roles: ['EXECUTIVE', 'ADMIN'] },
    { href: '/lookup', label: 'Quick Lookup', icon: Search, roles: ['EXECUTIVE', 'ADMIN'] },
    { href: '/downloads', label: 'Downloads', icon: Download, roles: ['EXECUTIVE', 'ADMIN'] },
    { href: '/accounts', label: 'Payments', icon: Wallet, roles: ['EXECUTIVE', 'ADMIN'] },
    { href: '/bookings/deleted', label: 'Deleted Bookings', icon: Trash2, roles: ['ADMIN'] },
    { href: '/admin', label: 'Admin', icon: UserCog, roles: ['ADMIN'] },
  ]

  const navItems = allNavItems.filter((item) => item.roles.includes(profile.role))

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-[4.25rem] w-full max-w-[1600px] items-center justify-between px-4 md:px-6 lg:px-8">
          <Link href="/dashboard" className="transition-opacity hover:opacity-85">
            <AnandamLogo />
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-10 gap-3 px-3">
                <Avatar className="size-8">
                  <AvatarFallback className="bg-zinc-900 text-sm text-white">
                    {getInitials(profile.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden text-left md:block">
                  <div className="text-sm font-medium text-zinc-900">{profile.full_name}</div>
                  <div className="text-xs text-zinc-500">{profile.role}</div>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="font-medium">{profile.full_name}</span>
                  <span className="text-xs font-normal text-zinc-500">{profile.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Settings className="mr-2 size-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600">
                <LogOut className="mr-2 size-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <nav className="sticky top-[4.25rem] z-40 border-b border-zinc-200/80 bg-white">
        <div className="mx-auto w-full max-w-[1600px] px-4 md:px-6 lg:px-8">
          <div className="scrollbar-hide -mb-px flex items-center gap-1 overflow-x-auto">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link key={item.href} href={item.href} prefetch className="shrink-0">
                  <span
                    className={cn(
                      'inline-flex items-center gap-2 border-b-2 px-3 py-3.5 text-sm font-medium transition-colors md:px-4',
                      isActive
                        ? 'border-zinc-900 text-zinc-900'
                        : 'border-transparent text-zinc-500 hover:border-zinc-200 hover:text-zinc-800'
                    )}
                  >
                    <Icon className="size-4 shrink-0 opacity-80" />
                    <span className="whitespace-nowrap">{item.label}</span>
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-[1600px] px-4 py-6 md:px-6 md:py-8 lg:px-8">{children}</main>
    </div>
  )
}
