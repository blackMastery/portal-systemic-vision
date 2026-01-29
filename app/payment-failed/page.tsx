'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

function PaymentFailedContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [errorDetails, setErrorDetails] = useState<{
    transactionId?: string;
    paymentId?: string;
    reason?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    const transactionId = searchParams.get('transactionId');
    const paymentId = searchParams.get('paymentId');
    const reason = searchParams.get('reason');
    const error = searchParams.get('error');

    setErrorDetails({
      transactionId: transactionId || undefined,
      paymentId: paymentId || undefined,
      reason: reason || undefined,
      error: error || undefined,
    });

    setLoading(false);
  }, [searchParams]);

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-red-50 to-white flex flex-col">
      {/* Error Icon & Header */}
      <div className="w-full bg-gradient-to-b from-red-500 to-red-600 px-6 py-16 flex flex-col items-center">
        <div className="flex items-center justify-center h-20 w-20 rounded-full bg-white mb-6">
          <svg
            className="h-10 w-10 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h1 className="text-4xl font-bold text-white text-center mb-3">Payment Failed</h1>
        <p className="text-red-50 text-center text-lg">We couldn&apos;t process your payment</p>
      </div>

      {/* Content */}
      <div className="flex-1 px-6 py-8">
        {/* Error Message */}
        {(errorDetails?.reason || errorDetails?.error) && (
          <div className="mb-8 p-5 bg-red-50 border border-red-200 rounded-lg">
            <h2 className="text-sm font-semibold text-red-900 mb-3 uppercase tracking-wide flex items-center">
              <svg className="h-4 w-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2z" clipRule="evenodd" />
              </svg>
              Error Details
            </h2>
            
            <p className="text-sm text-red-800 leading-relaxed">
              {errorDetails?.reason ? decodeURIComponent(errorDetails.reason) : decodeURIComponent(errorDetails?.error || 'Payment processing failed')}
            </p>
          </div>
        )}

        {/* Why It Failed */}
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Common Reasons</h3>
          <div className="space-y-3">
            <div className="flex items-start p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <svg className="h-5 w-5 text-yellow-600 mr-3 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-sm text-gray-700">Insufficient funds in your account</span>
            </div>
            
            <div className="flex items-start p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <svg className="h-5 w-5 text-yellow-600 mr-3 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-sm text-gray-700">Network connection interrupted</span>
            </div>

            <div className="flex items-start p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <svg className="h-5 w-5 text-yellow-600 mr-3 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-sm text-gray-700">Incorrect payment details</span>
            </div>

            <div className="flex items-start p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <svg className="h-5 w-5 text-yellow-600 mr-3 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-sm text-gray-700">Payment gateway timeout</span>
            </div>
          </div>
        </div>

        {/* Transaction Details */}
        {(errorDetails?.transactionId || errorDetails?.paymentId) && (
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Transaction Details</h3>
            
            <div className="space-y-4">
              {errorDetails?.transactionId && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                    Transaction ID
                  </p>
                  <p className="text-sm font-mono text-gray-800 break-all leading-relaxed">
                    {errorDetails.transactionId}
                  </p>
                </div>
              )}

              {errorDetails?.paymentId && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                    Payment Reference
                  </p>
                  <p className="text-sm font-mono text-gray-800 break-all leading-relaxed">
                    {errorDetails.paymentId}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty space for scrolling */}
        <div className="h-12"></div>
      </div>

      {/* Footer Info */}
      <div className="sticky bottom-0 w-full bg-white border-t border-gray-200 px-6 py-4 text-center">
        <p className="text-xs text-gray-500">Please try again from the app</p>
        <p className="text-xs text-gray-500 mt-1">or contact support for assistance</p>
      </div>
    </div>
  );
}

export default function PaymentFailedPage() {
  return (
    <Suspense fallback={
      <div className="w-full h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    }>
      <PaymentFailedContent />
    </Suspense>
  );
}
