import { NextRequest, NextResponse } from 'next/server'
import { handleApiError, ValidationError } from '@/lib/errors'
import { logger } from '@/lib/logger'

const VERSION_REGEX = /^\d+(\.\d+)*$/
const BUILD_REGEX = /^\d+$/

const APP_PLATFORM_ENV = {
  driver: {
    ios: {
      version: 'MOBILE_DRIVER_APP_IOS_VERSION',
      build: 'MOBILE_DRIVER_APP_IOS_BUILD_NUMBER',
    },
    android: {
      version: 'MOBILE_DRIVER_APP_ANDROID_VERSION',
      build: 'MOBILE_DRIVER_APP_ANDROID_BUILD_NUMBER',
    },
  },
  rider: {
    ios: {
      version: 'MOBILE_RIDER_APP_IOS_VERSION',
      build: 'MOBILE_RIDER_APP_IOS_BUILD_NUMBER',
    },
    android: {
      version: 'MOBILE_RIDER_APP_ANDROID_VERSION',
      build: 'MOBILE_RIDER_APP_ANDROID_BUILD_NUMBER',
    },
  },
} as const

type AppType = keyof typeof APP_PLATFORM_ENV
type Platform = 'ios' | 'android'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const appType = searchParams.get('app') as AppType | null
    const platform = searchParams.get('platform')?.toLowerCase() as Platform | null
    const clientVersion = searchParams.get('version')
    const clientBuild = searchParams.get('build')

    if (!appType || !APP_PLATFORM_ENV[appType]) {
      const { response, statusCode } = handleApiError(
        new ValidationError('Missing or invalid query parameter: app. Must be "driver" or "rider"')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    if (!platform || (platform !== 'ios' && platform !== 'android')) {
      const { response, statusCode } = handleApiError(
        new ValidationError('Missing or invalid query parameter: platform. Must be "ios" or "android"')
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

    if (!clientBuild) {
      const { response, statusCode } = handleApiError(
        new ValidationError('Missing required query parameter: build')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    if (!BUILD_REGEX.test(clientBuild)) {
      const { response, statusCode } = handleApiError(
        new ValidationError('Invalid build format. Expected a non-negative integer')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const envKeys = APP_PLATFORM_ENV[appType][platform]
    const latestVersion = process.env[envKeys.version]
    const latestBuildRaw = process.env[envKeys.build]

    if (!latestVersion || !latestBuildRaw) {
      logger.error('App version env not fully configured', {
        versionKey: envKeys.version,
        buildKey: envKeys.build,
        hasVersion: Boolean(latestVersion),
        hasBuild: Boolean(latestBuildRaw),
      })
      const { response, statusCode } = handleApiError(
        new Error('Version information unavailable')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    if (!VERSION_REGEX.test(latestVersion) || !BUILD_REGEX.test(latestBuildRaw.trim())) {
      logger.error('Invalid configured version or build in env', {
        versionKey: envKeys.version,
        buildKey: envKeys.build,
      })
      const { response, statusCode } = handleApiError(
        new Error('Version information unavailable')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const latestBuild = latestBuildRaw.trim()
    const versionMatch = clientVersion === latestVersion
    const buildMatch = parseInt(clientBuild, 10) === parseInt(latestBuild, 10)

    const upToDate = versionMatch && buildMatch

    logger.info('App version check', {
      app: appType,
      platform,
      clientVersion,
      clientBuild,
      latestVersion,
      latestBuild,
      upToDate,
    })

    return NextResponse.json(
      {
        up_to_date: upToDate,
        latest_version: latestVersion,
        latest_build_number: latestBuild,
      },
      { status: 200 }
    )
  } catch (error) {
    logger.error('Unexpected error checking app version', error)
    const { response, statusCode } = handleApiError(error)
    return NextResponse.json(response, { status: statusCode })
  }
}
