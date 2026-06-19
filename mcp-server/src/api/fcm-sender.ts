/**
 * fcm-sender.ts
 *
 * Direct Firebase Cloud Messaging (HTTP v1) sender — used for Android push.
 * Bypasses Expo's push service entirely: the app registers its raw FCM device
 * token (getDevicePushTokenAsync) and we POST to FCM v1 ourselves, authing with
 * a Firebase service-account key.
 *
 * Why direct instead of Expo: avoids uploading an FCM key to Expo's credentials
 * store. The same service-account key lives here as an env var instead.
 *
 * Config (one of):
 *   FCM_SERVICE_ACCOUNT       inline service-account JSON (string)  ← preferred for prod/Docker
 *   GOOGLE_APPLICATION_CREDENTIALS  path to the service-account JSON file
 * Optional:
 *   FCM_PROJECT_ID            overrides the project_id from the credentials
 */
import { GoogleAuth } from "google-auth-library";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

let cachedAuth: GoogleAuth | null = null;
let cachedProjectId: string | null = null;

interface FcmPayload {
  title: string;
  body: string;
  url?: string;
}

export interface FcmSendResult {
  sent: number;
  failed: number;
  /** Tokens FCM reports as permanently invalid — caller should delete them. */
  dead: string[];
}

/** Parse the service-account credentials from env, or null if unconfigured. */
function readCredentials(): Record<string, any> | null {
  const inline = process.env.FCM_SERVICE_ACCOUNT;
  if (inline) {
    try {
      return JSON.parse(inline);
    } catch (err) {
      console.error("[fcm] FCM_SERVICE_ACCOUNT is not valid JSON:", err);
      return null;
    }
  }
  return null;
}

/** True when a usable FCM config is present (inline JSON or ADC file path). */
export function fcmConfigured(): boolean {
  return !!readCredentials() || !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
}

function getAuth(): GoogleAuth | null {
  if (cachedAuth) return cachedAuth;
  const credentials = readCredentials();
  if (credentials) {
    cachedAuth = new GoogleAuth({ credentials, scopes: [FCM_SCOPE] });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Application Default Credentials read the file at the env path.
    cachedAuth = new GoogleAuth({ scopes: [FCM_SCOPE] });
  } else {
    return null;
  }
  return cachedAuth;
}

async function resolveProjectId(auth: GoogleAuth): Promise<string | null> {
  if (cachedProjectId) return cachedProjectId;
  cachedProjectId =
    process.env.FCM_PROJECT_ID ||
    readCredentials()?.project_id ||
    (await auth.getProjectId().catch(() => null));
  return cachedProjectId;
}

/** FCM error codes that mean the token is permanently dead. */
const DEAD_TOKEN_ERRORS = new Set(["UNREGISTERED", "INVALID_ARGUMENT"]);

/**
 * Send one notification to many raw FCM device tokens.
 * FCM HTTP v1 has no REST multicast, so we fan out one request per token
 * (fine for the handful of tokens a single user has), reusing one access token.
 */
export async function sendFcmV1(
  tokens: string[],
  payload: FcmPayload
): Promise<FcmSendResult> {
  const result: FcmSendResult = { sent: 0, failed: 0, dead: [] };
  if (tokens.length === 0) return result;

  const auth = getAuth();
  if (!auth) {
    console.warn(
      "[fcm] no credentials (set FCM_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS); skipping FCM channel"
    );
    result.failed += tokens.length;
    return result;
  }

  const projectId = await resolveProjectId(auth);
  if (!projectId) {
    console.error("[fcm] could not resolve project_id");
    result.failed += tokens.length;
    return result;
  }

  let accessToken: string | null | undefined;
  try {
    accessToken = await auth.getAccessToken();
  } catch (err) {
    console.error("[fcm] failed to mint access token:", err);
    result.failed += tokens.length;
    return result;
  }
  if (!accessToken) {
    result.failed += tokens.length;
    return result;
  }

  const endpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  for (const token of tokens) {
    const message = {
      message: {
        token,
        notification: { title: payload.title, body: payload.body },
        // FCM data values must be strings.
        data: { url: payload.url ?? "", source: "push" },
        android: {
          priority: "HIGH" as const,
          notification: {
            // Route to the high-importance channel the app creates so heads-up
            // banners show (matches push-registration.ts).
            channel_id: "push-notifications",
            sound: "default",
          },
        },
      },
    };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });

      if (res.ok) {
        result.sent++;
        continue;
      }

      result.failed++;
      let errorCode = "";
      try {
        const errBody: any = await res.json();
        errorCode =
          errBody?.error?.details?.find((d: any) => d.errorCode)?.errorCode ||
          errBody?.error?.status ||
          "";
        console.error(
          `[fcm] send failed (${res.status} ${errorCode}):`,
          errBody?.error?.message || ""
        );
      } catch {
        console.error(`[fcm] send failed (${res.status})`);
      }
      if (DEAD_TOKEN_ERRORS.has(errorCode)) {
        result.dead.push(token);
      }
    } catch (err) {
      result.failed++;
      console.error("[fcm] network error sending to token:", err);
    }
  }

  return result;
}
