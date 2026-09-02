'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Car,
  Route,
  CreditCard,
  BarChart3,
  Settings,
  Menu,
  X,
  FileText,
  Megaphone,
  MessageSquare,
  ClipboardList,
  FileCheck,
  MapPin,
  Flag,
  ShieldAlert,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

const REVIEW_QUEUE_HREF = '/admin/review-queue'
const INCIDENTS_HREF = '/admin/incidents'

const navigation = [
  { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { name: 'Drivers', href: '/admin/drivers', icon: Car },
  { name: 'Riders', href: '/admin/riders', icon: Users },
  { name: 'Trips', href: '/admin/trips', icon: Route },
  { name: 'Review Queue', href: REVIEW_QUEUE_HREF, icon: Flag },
  { name: 'Incidents', href: INCIDENTS_HREF, icon: ShieldAlert },
  { name: 'Trip Requests', href: '/admin/trip-requests', icon: ClipboardList },
  { name: 'Payments', href: '/admin/payments', icon: CreditCard },
  { name: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
  { name: 'Notifications', href: '/admin/notifications', icon: Megaphone },
  { name: 'Message Logs', href: '/admin/message-logs', icon: MessageSquare },
  { name: 'Audit Log', href: '/admin/audit-log', icon: FileText },
  { name: 'Agreement Acceptances', href: '/admin/agreement-acceptances', icon: FileCheck },
  { name: 'Cost landmarks', href: '/admin/cost-estimate-landmarks', icon: MapPin },
  { name: 'Settings', href: '/admin/settings', icon: Settings },
]

async function fetchOpenReviewCount(): Promise<number> {
  const supabase = createClient()
  const { count, error } = await supabase
    .from('rating_review_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open')
  if (error) return 0
  return count ?? 0
}

async function fetchOpenIncidentCount(): Promise<number> {
  const supabase = createClient()
  const { count, error } = await supabase
    .from('incidents')
    .select('id', { count: 'exact', head: true })
    .in('status', ['open', 'under_review', 'escalated'])
  if (error) return 0
  return count ?? 0
}

const COLLAPSED_STORAGE_KEY = 'admin-sidebar-collapsed'

export function AdminSidebar() {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // Read after mount so server and client render the same initial markup
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true')
    } catch {
      // localStorage unavailable; leave expanded
    }
  }, [])

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, String(!prev))
      } catch {
        // ignore
      }
      return !prev
    })
  }

  const { data: openReviewCount } = useQuery({
    queryKey: ['review-queue-open-count'],
    queryFn: fetchOpenReviewCount,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })

  const { data: openIncidentCount } = useQuery({
    queryKey: ['incidents-open-count'],
    queryFn: fetchOpenIncidentCount,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })

  return (
    <>
      {/* Mobile menu button */}
      <button
        type="button"
        className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-md bg-white shadow-lg"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
      >
        {mobileMenuOpen ? (
          <X className="h-6 w-6 text-gray-600" />
        ) : (
          <Menu className="h-6 w-6 text-gray-600" />
        )}
      </button>

      {/* Sidebar */}
      <aside
        className={`${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0 fixed md:static inset-y-0 left-0 z-40 w-64 ${
          collapsed ? 'md:w-20' : 'md:w-64'
        } bg-white border-r border-gray-200 transition-all duration-300 ease-in-out`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div
            className={`flex items-center h-16 border-b border-gray-200 px-6 ${
              collapsed ? 'md:justify-center md:px-2' : 'md:justify-between'
            }`}
          >
            <h1 className={`text-2xl font-bold text-primary-strong ${collapsed ? 'md:hidden' : ''}`}>
              Links
            </h1>
            <button
              type="button"
              onClick={toggleCollapsed}
              className="hidden md:inline-flex p-2 rounded-md text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
              const Icon = item.icon
              
              const showBadge =
                (item.href === REVIEW_QUEUE_HREF && (openReviewCount ?? 0) > 0) ||
                (item.href === INCIDENTS_HREF && (openIncidentCount ?? 0) > 0)
              const badgeCount =
                item.href === REVIEW_QUEUE_HREF
                  ? openReviewCount
                  : item.href === INCIDENTS_HREF
                    ? openIncidentCount
                    : 0
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  title={collapsed ? item.name : undefined}
                  className={`relative flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                    collapsed ? 'md:justify-center md:px-2' : ''
                  } ${
                    isActive
                      ? 'bg-primary-soft text-primary-strong'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon
                    className={`mr-3 h-5 w-5 ${collapsed ? 'md:mr-0' : ''} ${
                      isActive ? 'text-primary-strong' : 'text-gray-400'
                    }`}
                  />
                  <span className={`flex-1 ${collapsed ? 'md:hidden' : ''}`}>{item.name}</span>
                  {showBadge && (
                    <span
                      className={`ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-semibold ${
                        collapsed ? 'md:absolute md:top-1 md:right-1 md:ml-0 md:min-w-[1rem] md:h-4 md:px-1 md:text-[10px]' : ''
                      }`}
                      aria-label={`${badgeCount} open items`}
                    >
                      {(badgeCount ?? 0) > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200">
            <p className={`text-xs text-gray-500 text-center ${collapsed ? 'md:hidden' : ''}`}>
              © 2026 Links Admin
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
    </>
  )
}
