import PocketBase from "pocketbase";

export interface UserContext {
  userId: string;
  token: string;
  email: string;
  timezone: string;
}

export class AuthManager {
  private pb: PocketBase;
  private userId: string;
  private email: string;
  private timezone: string;

  constructor(pbUrl: string, context: UserContext) {
    this.pb = new PocketBase(pbUrl);
    // Save the validated token so all subsequent requests are authenticated
    this.pb.authStore.save(context.token, { id: context.userId } as any);
    this.userId = context.userId;
    this.email = context.email;
    this.timezone = context.timezone;
  }

  getClient(): PocketBase {
    return this.pb;
  }

  getUserId(): string {
    return this.userId;
  }

  getEmail(): string {
    return this.email;
  }

  getTimezone(): string {
    return this.timezone;
  }
}

/**
 * Validate a PocketBase Bearer token and return the user context.
 * Called once per HTTP request before creating the AuthManager.
 */
export async function validateBearerToken(
  pbUrl: string,
  authHeader: string | undefined
): Promise<UserContext> {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error(
      "Authentication required. Provide your PocketBase token as 'Authorization: Bearer <token>'. " +
        "Get your token from the Calistenia app: open DevTools > Application > Local Storage > look for 'pb_auth' key."
    );
  }

  const token = authHeader.slice(7);
  const pb = new PocketBase(pbUrl);
  pb.authStore.save(token, null);

  try {
    const result = await pb.collection("users").authRefresh();
    return {
      userId: result.record.id,
      token: pb.authStore.token,
      email: result.record.email as string,
      timezone: (result.record as any).timezone || "UTC",
    };
  } catch {
    throw new Error(
      "Invalid or expired token. Please log in to the Calistenia app and copy a fresh token from " +
        "DevTools > Application > Local Storage > 'pb_auth' > token field."
    );
  }
}

/**
 * Validate a token provided via environment variable (stdio mode).
 */
export async function validateEnvToken(pbUrl: string): Promise<UserContext> {
  const token = process.env.PB_TOKEN;
  if (!token) {
    throw new Error(
      "PB_TOKEN environment variable is required for stdio mode. " +
        "Get it from the Calistenia app: DevTools > Application > Local Storage > 'pb_auth' > token."
    );
  }
  return validateBearerToken(pbUrl, `Bearer ${token}`);
}
