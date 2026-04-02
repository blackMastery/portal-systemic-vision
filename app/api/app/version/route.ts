import { NextRequest, NextResponse } from 'next/server'
import { handleApiError, ValidationError } from '@/lib/errors'
import { logger } from '@/lib/logger'

function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number)
  const bParts = b.split('.').map(Number)
  const len = Math.max(aParts.length, bParts.length)

  for (let i = 0; i < len; i++) {
    const aPart = aParts[i] ?? 0
    const bPart = bParts[i] ?? 0
    if (aPart > bPart) return 1
    if (aPart < bPart) return -1
  }

  return 0
}

const VERSION_REGEX = /^\d+(\.\d+)*$/

const APP_VERSION_ENV: Record<string, string> = {
  driver: 'MOBILE_DRIVER_APP_VERSION',
  rider: 'MOBILE_RIDER_APP_VERSION',
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const appType = searchParams.get('app')
    const clientVersion = searchParams.get('version')

    if (!appType || !APP_VERSION_ENV[appType]) {
      const { response, statusCode } = handleApiError(
        new ValidationError('Missing or invalid query parameter: app. Must be "driver" or "rider"')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    if (!clientVersion) {
      const { response, statusCode } = handleApiError(
        new ValidationError('Missing required query parameter: version')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    if (!VERSION_REGEX.test(clientVersion)) {
      const { response, statusCode } = handleApiError(
        new ValidationError('Invalid version format. Expected format: x.y.z')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const latestVersion = process.env[APP_VERSION_ENV[appType]]

    if (!latestVersion) {
      logger.error(`${APP_VERSION_ENV[appType]} is not configured`)
      const { response, statusCode } = handleApiError(
        new Error('Version information unavailable')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const upToDate = compareVersions(clientVersion, latestVersion) >= 0

    logger.info('App version check', { app: appType, clientVersion, latestVersion, upToDate })

    return NextResponse.json(
      { up_to_date: upToDate, latest_version: latestVersion },
      { status: 200 }
    )
  } catch (error) {
    logger.error('Unexpected error checking app version', error)
    const { response, statusCode } = handleApiError(error)
    return NextResponse.json(response, { status: statusCode })
  }
}
