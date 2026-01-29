'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [paymentDetails, setPaymentDetails] = useState<{
    transactionId: string;
    paymentId: string;
  } | null>(null);

  useEffect(() => {
    const transactionId = searchParams.get('transactionId');
    const paymentId = searchParams.get('paymentId');

    if (transactionId && paymentId) {
      setPaymentDetails({ transactionId, paymentId });
    }

    setLoading(false);
  }, [searchParams]);

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-green-50 to-white flex flex-col">
      {/* Success Icon & Header */}
      <div className="w-full bg-gradient-to-b from-green-500 to-green-600 px-6 py-16 flex flex-col items-center">
        <div className="flex items-center justify-center h-20 w-20 rounded-full bg-white mb-6">
          <svg
            className="h-10 w-10 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h1 className="text-4xl font-bold text-white text-center mb-3">Payment Successful!</h1>
        <p className="text-green-50 text-center text-lg">Your subscription is now active</p>
      </div>

      {/* Content */}
      <div className="flex-1 px-6 py-8">
        {/* Subscription Status */}
        <div className="mb-8 p-5 bg-white border-l-4 border-green-500 rounded-lg shadow-sm">
          <div className="flex items-center mb-2">
            <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
            <h2 className="text-lg font-bold text-gray-900">Subscription Active</h2>
          </div>
          <p className="text-gray-600 text-sm">Valid for 30 days</p>
          <p className="text-gray-500 text-xs mt-2">Expires: {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}</p>
        </div>

        {/* Transaction Details */}
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Transaction Details</h3>
          
          <div className="space-y-4">
            {paymentDetails?.transactionId && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                  Transaction ID
                </p>
                <p className="text-sm font-mono text-gray-800 break-all leading-relaxed">
                  {paymentDetails.transactionId}
                </p>
              </div>
            )}
            
            {paymentDetails?.paymentId && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                  Payment Reference
                </p>
                <p className="text-sm font-mono text-gray-800 break-all leading-relaxed">
                  {paymentDetails.paymentId}
                </p>
              </div>
            )}

            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                Date & Time
              </p>
              <p className="text-sm text-gray-800">
                {new Date().toLocaleString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Benefits */}
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">What You Get</h3>
          <div className="space-y-3">
            <div className="flex items-start p-4 bg-green-50 rounded-lg border border-green-200">
              <svg className="h-5 w-5 text-green-600 mr-3 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-sm text-gray-700">Access to all premium features</span>
            </div>
            
            <div className="flex items-start p-4 bg-green-50 rounded-lg border border-green-200">
              <svg className="h-5 w-5 text-green-600 mr-3 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-sm text-gray-700">30 days of active subscription</span>
            </div>

            <div className="flex items-start p-4 bg-green-50 rounded-lg border border-green-200">
              <svg className="h-5 w-5 text-green-600 mr-3 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-sm text-gray-700">Confirmation email sent</span>
            </div>
          </div>
        </div>

        {/* Empty space for scrolling */}
        <div className="h-12"></div>
      </div>

      {/* Footer Info */}
      <div className="sticky bottom-0 w-full bg-white border-t border-gray-200 px-6 py-4 text-center">
        <p className="text-xs text-gray-500">Transaction verified and recorded</p>
        <p className="text-xs text-gray-500 mt-1">You can now close this screen</p>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div className="w-full h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    }>
      <PaymentSuccessContent />
    </Suspense>
  );
}
