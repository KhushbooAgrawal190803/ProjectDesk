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
  Building2, 
  LayoutDashboard, 
  FileText, 
  Search, 
  Download, 
  Settings, 
  LogOut,
  UserCog,
  PlusCircle,
  Trash2
} from 'lucide-react'
import { Profile } from '@/lib/types/database'
import { toast } from 'sonner'
import NProgress from 'nprogress'

interface DashboardLayoutProps {
  children: ReactNode
  profile: Profile
}

export function DashboardLayout({ children, profile }: DashboardLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()

  // Initialize NProgress
  React.useEffect(() => {
    NProgress.configure({ 
      showSpinner: false,
      trickleSpeed: 100,
      minimum: 0.08,
      easing: 'ease',
      speed: 200
    })
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    toast.success('Signed out successfully')
    router.push('/login')
    router.refresh()
  }

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/new-booking', label: 'New Booking', icon: PlusCircle },
    { href: '/bookings', label: 'All Bookings', icon: FileText },
    { href: '/lookup', label: 'Quick Lookup', icon: Search },
    { href: '/downloads', label: 'Downloads', icon: Download },
  ]

  if (profile.role === 'ADMIN') {
    navItems.push(
      { href: '/bookings/deleted', label: 'Deleted Bookings', icon: Trash2 },
      { href: '/admin', label: 'Admin', icon: UserCog }
    )
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-50">
        <div className="w-full px-4 md:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 md:gap-3 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 md:w-9 md:h-9 bg-zinc-900 rounded-lg flex items-center justify-center flex-shrink-0">
              <Building2 className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-base md:text-lg font-semibold text-zinc-900 whitespace-nowrap">Level Up Buildcon</h1>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-10 gap-3 px-3">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-zinc-900 text-white text-sm">
                      {getInitials(profile.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden md:block text-left">
                    <div className="text-sm font-medium">{profile.full_name}</div>
                    <div className="text-xs text-zinc-500">{profile.role}</div>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="font-medium">{profile.full_name}</span>
                    <span className="text-xs text-zinc-500 font-normal">{profile.email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-zinc-200">
        <div className="w-full px-4 md:px-6 lg:px-8">
          <div className="flex items-center justify-start gap-0.5 overflow-x-auto scrollbar-hide">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              
              return (
                <Link 
                  key={item.href} 
                  href={item.href}
                  prefetch={true}
                  className="nav-link-transition flex-shrink-0"
                  onClick={(e) => {
                    if (!isActive) {
                      NProgress.start()
                    }
                  }}
                >
                  <Button
                    variant="ghost"
                    className={`h-11 md:h-12 px-3 md:px-5 rounded-none border-b-2 transition-all duration-150 font-medium text-sm whitespace-nowrap ${
                      isActive
                        ? 'border-zinc-900 text-zinc-900'
                        : 'border-transparent text-zinc-600 hover:text-zinc-900 hover:border-zinc-200'
                    }`}
                  >
                    <Icon className="w-4 h-4 md:mr-2" />
                    <span className="hidden md:inline ml-2">{item.label}</span>
                  </Button>
                </Link>
              )
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="w-full px-4 md:px-6 lg:px-8 max-w-[1600px] mx-auto py-6 md:py-8">
        {children}
      </main>
    </div>
  )
}

