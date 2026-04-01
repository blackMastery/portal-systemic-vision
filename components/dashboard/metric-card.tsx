import Link from 'next/link'
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react'

interface MetricCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  trend?: string
  trendUp?: boolean
  color?: 'blue' | 'green' | 'purple' | 'yellow' | 'indigo' | 'emerald' | 'red'
  href?: string
}

const colorClasses = {
  blue: 'bg-blue-100 text-blue-600',
  green: 'bg-green-100 text-green-600',
  purple: 'bg-purple-100 text-purple-600',
  yellow: 'bg-yellow-100 text-yellow-600',
  indigo: 'bg-indigo-100 text-indigo-600',
  emerald: 'bg-emerald-100 text-emerald-600',
  red: 'bg-red-100 text-red-600',
}

export function MetricCard({
  title,
  value,
  icon: Icon,
  trend,
  trendUp,
  color = 'blue',
  href,
}: MetricCardProps) {
  const content = (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow${href ? ' cursor-pointer' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
          
          {trend && (
            <div className="mt-2 flex items-center">
              {trendUp ? (
                <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500 mr-1" />
              )}
              <span
                className={`text-sm font-medium ${
                  trendUp ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {trend}
              </span>
              <span className="text-sm text-gray-500 ml-1">vs last week</span>
            </div>
          )}
        </div>
        
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }

  return content
}
