/**
 * Firebase Admin SDK initialization
 * Handles server-side Firebase operations including Cloud Messaging
 * Supports multiple Firebase projects (driver app and rider app)
 */

import { initializeApp, getApps, cert, App } from 'firebase-admin/app'
import { getMessaging, Messaging } from 'firebase-admin/messaging'
import { logger } from '@/lib/logger'

export type FirebaseProjectType = 'driver' | 'rider'

// Cache for initialized Firebase apps
const firebaseApps: Map<FirebaseProjectType, App> = new Map()
const messagingInstances: Map<FirebaseProjectType, Messaging> = new Map()

/**
 * Initialize Firebase Admin SDK for a specific project type
 * Supports JSON string, file path, or URL for service account credentials
 */
async function initializeFirebaseAdmin(projectType: FirebaseProjectType): Promise<App> {
  // Return existing app if already initialized
  const existingApp = firebaseApps.get(projectType)
  if (existingApp) {
    return existingApp
  }

  try {
    // Get credentials based on project type
    const serviceAccountKey =
      projectType === 'driver'
        ? process.env.FIREBASE_DRIVER_SERVICE_ACCOUNT_KEY
        : process.env.FIREBASE_RIDER_SERVICE_ACCOUNT_KEY

    const serviceAccountPath =
      projectType === 'driver'
        ? process.env.FIREBASE_DRIVER_SERVICE_ACCOUNT_PATH
        : process.env.FIREBASE_RIDER_SERVICE_ACCOUNT_PATH

    if (!serviceAccountKey && !serviceAccountPath) {
      throw new Error(
        `Firebase service account credentials not found for ${projectType} app. Please set either FIREBASE_${projectType.toUpperCase()}_SERVICE_ACCOUNT_KEY or FIREBASE_${projectType.toUpperCase()}_SERVICE_ACCOUNT_PATH environment variable.`
      )
    }

    let credential

    if (serviceAccountKey) {
      // Check if it's a URL (starts with http:// or https://)
      if (serviceAccountKey.startsWith('http://') || serviceAccountKey.startsWith('https://')) {
        // Fetch JSON from URL
        try {
          const response = await fetch(serviceAccountKey)
          if (!response.ok) {
            throw new Error(`Failed to fetch service account from URL: ${response.statusText}`)
          }
          const serviceAccount = await response.json()
          credential = cert(serviceAccount)
          logger.info(`Fetched Firebase service account from URL for ${projectType} app`)
        } catch (fetchError) {
          throw new Error(
            `Failed to fetch FIREBASE_${projectType.toUpperCase()}_SERVICE_ACCOUNT_KEY from URL: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`
          )
        }
      } else {
        // Parse JSON string from environment variable
        try {
          const serviceAccount = JSON.parse(serviceAccountKey)
          credential = cert(serviceAccount)
        } catch (parseError) {
          throw new Error(
            `Failed to parse FIREBASE_${projectType.toUpperCase()}_SERVICE_ACCOUNT_KEY. Ensure it is valid JSON or a valid URL.`
          )
        }
      }
    } else if (serviceAccountPath) {
      // Use file path
      credential = cert(serviceAccountPath)
    }

    // Use project type as app name to allow multiple apps
    const appName = `firebase-${projectType}`
    
    // Check if app with this name already exists
    const existingApps = getApps()
    const appWithName = existingApps.find((app) => app.name === appName)
    
    if (appWithName) {
      firebaseApps.set(projectType, appWithName)
      return appWithName
    }

    const app = initializeApp(
      {
        credential,
      },
      appName
    )

    firebaseApps.set(projectType, app)
    logger.info(`Firebase Admin SDK initialized successfully for ${projectType} app`)
    return app
  } catch (error) {
    logger.error(`Failed to initialize Firebase Admin SDK for ${projectType} app`, error)
    throw error
  }
}

/**
 * Get Firebase Messaging instance for a specific project type
 * Initializes Firebase Admin if not already initialized
 */
export async function getMessagingInstance(projectType: FirebaseProjectType): Promise<Messaging> {
  const existingInstance = messagingInstances.get(projectType)
  if (existingInstance) {
    return existingInstance
  }

  const app = await initializeFirebaseAdmin(projectType)
  const messaging = getMessaging(app)
  messagingInstances.set(projectType, messaging)
  return messaging
}

/**
 * Get Firebase App instance for a specific project type
 * Initializes Firebase Admin if not already initialized
 */
export async function getFirebaseApp(projectType: FirebaseProjectType): Promise<App> {
  const existingApp = firebaseApps.get(projectType)
  if (existingApp) {
    return existingApp
  }

  return initializeFirebaseAdmin(projectType)
}
