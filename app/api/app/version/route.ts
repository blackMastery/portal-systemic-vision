import { NextRequest, NextResponse } from 'next/server'
import { handleApiError, ValidationError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { createSupabaseServiceClient } from '@/lib/firebase/notifications'
import { isValidAppVersionString, isValidBuildString } from '@/lib/app-version'
import type { AppVersionAppType, AppVersionPlatform } from '@/types/database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const appType = searchParams.get('app') as AppVersionAppType | null
    const platform = searchParams.get('platform')?.toLowerCase() as AppVersionPlatform | null
    const clientVersionRaw = searchParams.get('version')
    const clientBuildRaw = searchParams.get('build')

    if (!appType || (appType !== 'driver' && appType !== 'rider')) {
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

    if (!clientVersionRaw) {
      const { response, statusCode } = handleApiError(
        new ValidationError('Missing required query parameter: version')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const clientVersion = clientVersionRaw.trim()
    if (!isValidAppVersionString(clientVersion)) {
      const { response, statusCode } = handleApiError(
        new ValidationError('Invalid version format. Expected format: x.y.z')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    if (!clientBuildRaw) {
      const { response, statusCode } = handleApiError(
        new ValidationError('Missing required query parameter: build')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const clientBuild = clientBuildRaw.trim()
    if (!isValidBuildString(clientBuild)) {
      const { response, statusCode } = handleApiError(
        new ValidationError('Invalid build format. Expected a non-negative integer')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const supabase = createSupabaseServiceClient()
    const { data: row, error } = await supabase
      .from('app_version_config')
      .select('version_string, build_number, mandatory_update')
      .eq('app_type', appType)
      .eq('platform', platform)
      .maybeSingle()

    if (error) {
      logger.error('App version DB read failed', { error, appType, platform })
      const { response, statusCode } = handleApiError(
        new Error('Version information unavailable')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    if (!row) {
      logger.error('App version row missing', { appType, platform })
      const { response, statusCode } = handleApiError(
        new Error('Version information unavailable')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const latestVersion = row.version_string.trim()
    if (!isValidAppVersionString(latestVersion)) {
      logger.error('Invalid version_string in app_version_config', { appType, platform })
      const { response, statusCode } = handleApiError(
        new Error('Version information unavailable')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const latestBuild = String(row.build_number)
    const versionMatch = clientVersion === latestVersion
    const buildMatch = parseInt(clientBuild, 10) === row.build_number

    const upToDate = versionMatch && buildMatch
    const mandatoryUpdate = Boolean(row.mandatory_update)
    const updateRequired = !upToDate && mandatoryUpdate

    logger.info('App version check', {
      app: appType,
      platform,
      clientVersion,
      clientBuild,
      latestVersion,
      latestBuild,
      upToDate,
      mandatory_update: mandatoryUpdate,
      update_required: updateRequired,
    })

    return NextResponse.json(
      {
        up_to_date: upToDate,
        latest_version: latestVersion,
        latest_build_number: latestBuild,
        mandatory_update: mandatoryUpdate,
        update_required: updateRequired,
      },
      { status: 200 }
    )
  } catch (error) {
    logger.error('Unexpected error checking app version', error)
    const { response, statusCode } = handleApiError(error)
    return NextResponse.json(response, { status: statusCode })
  }
}
