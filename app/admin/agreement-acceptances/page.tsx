'use client'

import Link from 'next/link'
import { FileCheck } from 'lucide-react'
import { AgreementAcceptancesLog } from '../settings/agreement-acceptances-log'

export default function AdminAgreementAcceptancesPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <div className="flex items-center gap-2 text-gray-600 mb-1">
          <FileCheck className="h-6 w-6" />
          <span className="text-sm font-medium uppercase tracking-wide">Compliance</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Agreement Acceptances</h1>
        <p className="mt-2 text-gray-600">
          Review user acceptance records for published agreements. Filter by role, user, and date,
          then open signed PDFs for audit and support workflows.
        </p>
      </div>

      <AgreementAcceptancesLog />

      <div>
        <Link href="/admin/settings" className="text-sm text-gray-600 hover:text-gray-900">
          Back to settings
        </Link>
      </div>
    </div>
  )
}
