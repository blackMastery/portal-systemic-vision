import { ReactNode } from 'react'

interface ChartWrapperProps {
  title: string
  description?: string
  children: ReactNode
  isLoading?: boolean
  isError?: boolean
  isEmpty?: boolean
  emptyMessage?: string
}

export function ChartWrapper({
  title,
  description,
  children,
  isLoading,
  isError,
  isEmpty,
  emptyMessage = 'No data available',
}: ChartWrapperProps) {
  return (
    <div className="min-w-0 bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {description && (
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        )}
      </div>
      
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-strong"></div>
        </div>
      ) : isError ? (
        <div className="flex items-center justify-center h-64 text-red-600">
          <p>Failed to load this data — refresh to retry.</p>
        </div>
      ) : isEmpty ? (
        <div className="flex items-center justify-center h-64 text-gray-500">
          <p>{emptyMessage}</p>
        </div>
      ) : (
        <div className="w-full">
          {children}
        </div>
      )}
    </div>
  )
}

