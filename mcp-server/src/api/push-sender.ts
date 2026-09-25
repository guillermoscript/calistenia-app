import webpush from "web-push";
import { Expo } from "expo-server-sdk";
import { getAdminPB } from "./admin-pb.js";
import { sendFcmV1 } from "./fcm-sender.js";

const vapidPublicKey = process.env.VITE_VAPID_PUBLIC_KEY || "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    "mailto:noreply@calistenia.app",
    vapidPublicKey,
    vapidPrivateKey
  );
}

const expo = new Expo();

// ─── Idioma del push (#804) ─────────────────────────────────────────────────
//
// `users.language` (migración 1790300000) lo escribe el cliente con el idioma
// que la app enseña de verdad; puede venir vacío en cuentas que no han abierto
// aún una versión que sincroniza. El servidor solo conoce dos idiomas — todo
// lo demás (vacío, "pt", basura) cae a español, igual que `safeTimeZone` cae a
// UTC con una zona inválida.
export type PushLanguage = "es" | "en";

/** Copy de un push: texto plano (sin traducir) o `{es, en}` con al menos uno. */
export type LocalizedText =
  | string
  | { es: string; en?: string }
  | { es?: string; en: string };

/** "en"/"en-US"/"EN" → "en"; cualquier otra cosa (incl. vacío/undefined/"pt") → "es". */
export function normalizePushLanguage(raw: unknown): PushLanguage {
  if (typeof raw !== "string") return "es";
  return raw.trim().toLowerCase().startsWith("en") ? "en" : "es";
}

/**
 * Resuelve un `LocalizedText` al idioma pedido. Un string pasa tal cual
 * (compatibilidad con todo el código que aún no localiza su copy); un objeto
 * cae a `es`, luego a `en`, luego a cadena vacía — nunca debe llegar `undefined`
 * a un canal de push.
 */
export function pickLocalized(text: LocalizedText | undefined, lang: PushLanguage): string {
  if (text == null) return "";
  if (typeof text === "string") return text;
  return text[lang] ?? text.es ?? text.en ?? "";
}

/** ¿Vale como copy de push? String no vacío, u objeto con al menos un `es`/`en` no vacío. */
export function isValidPushText(value: unknown): value is LocalizedText {
  if (typeof value === "string") return value.trim().length > 0;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    let hasValid = false;
    for (const key of ["es", "en"] as const) {
      if (!(key in obj)) continue;
      if (typeof obj[key] !== "string") return false; // valor de es/en que no es string
      if ((obj[key] as string).trim().length > 0) hasValid = true;
    }
    return hasValid;
  }
  return false;
}

interface PushPayload {
  title: LocalizedText;
  body?: LocalizedText;
  url?: string;
  /** Campaña del push (p. ej. "workout_reminder", "inactivity_24h") — viaja en
   * el `data` de cada canal para que el cliente pueda registrar de qué push
   * viene un `notification_clicked`. */
  campaign?: string;
  /**
   * Idioma ya resuelto por el llamante (los dispatchers por lote cargan el
   * idioma de todos los usuarios en una sola consulta — ver `loadLanguages`
   * en reminder-dispatcher.ts — y no tiene sentido repetirla aquí por push).
   * Si se omite y `title`/`body` son objetos, se resuelve con UNA lectura del
   * usuario; si son strings planos, da igual el idioma y no se lee nada.
   */
  language?: PushLanguage;
}

export async function sendPushToUser(
  userId: string,
  rawPayload: PushPayload
): Promise<{ sent: number; failed: number }> {
  const pb = await getAdminPB();

  // Resolver título/cuerpo a texto plano ANTES de tocar ningún canal: ni
  // web-push, ni Expo, ni FCM deben ver nunca un objeto {es,en}.
  const needsLanguageLookup =
    rawPayload.language === undefined &&
    (typeof rawPayload.title === "object" || typeof rawPayload.body === "object");
  let language: PushLanguage = rawPayload.language ?? "es";
  if (needsLanguageLookup) {
    try {
      const user = await pb.collection("users").getOne(userId, { fields: "language" });
      language = normalizePushLanguage((user as any).language);
    } catch (err) {
      console.error(`[push] no se pudo resolver el idioma de ${userId}, usando es:`, err);
      language = "es";
    }
  }
  const payload = {
    title: pickLocalized(rawPayload.title, language),
    body: pickLocalized(rawPayload.body, language),
    url: rawPayload.url,
    campaign: rawPayload.campaign,
  };

  let sent = 0;
  let failed = 0;

  // ── Web Push channel ──────────────────────────────────────────────────────
  try {
    const subs = await pb.collection("push_subscriptions").getList(1, 20, {
      filter: pb.filter("user = {:uid}", { uid: userId }),
    });

    for (const rec of subs.items) {
      const subscription = (rec as any).subscription;
      try {
        const sub =
          typeof subscription === "string"
            ? JSON.parse(subscription)
            : subscription;
        await webpush.sendNotification(sub, JSON.stringify(payload));
        sent++;
      } catch (err: any) {
        // 410 Gone — subscription expired, remove it
        if (err.statusCode === 410 || err.statusCode === 404) {
          try {
            await pb.collection("push_subscriptions").delete(rec.id);
          } catch {
            /* ignore */
          }
        }
        failed++;
      }
    }
  } catch (err) {
    console.error("[push] web-push channel error:", err);
  }

  // ── Native push tokens (Expo for iOS, direct FCM for Android) ──────────────
  // The `expo_push_tokens` collection holds both: Expo tokens
  // (ExponentPushToken[...]) go through Expo's service; raw Android FCM tokens
  // (registered via getDevicePushTokenAsync) go straight to FCM v1.
  let nativeTokenRecords: { items: any[] } = { items: [] };
  try {
    nativeTokenRecords = await pb
      .collection("expo_push_tokens")
      .getList(1, 50, {
        filter: pb.filter("user = {:uid}", { uid: userId }),
      });
  } catch (err) {
    console.error("[push] native token fetch error:", err);
  }

  // ── Expo Push channel ─────────────────────────────────────────────────────
  try {
    const messages = nativeTokenRecords.items
      .filter((rec) => Expo.isExpoPushToken((rec as any).token))
      .map((rec) => ({
        _recId: rec.id,
        to: (rec as any).token as string,
        title: payload.title,
        body: payload.body,
        sound: "default" as const,
        priority: "high" as const,
        // Android: route to the HIGH-importance channel created by the app
        // (push-registration.ts). Without this Android uses the default channel
        // and heads-up banners may not show.
        channelId: "push-notifications",
        // `source: 'push'` lets the mobile foreground handler distinguish remote
        // push (show banner) from the in-session rest timer (stay silent).
        data: { url: payload.url, source: "push", campaign: payload.campaign ?? "" },
      }));

    if (messages.length > 0) {
      const chunks = expo.chunkPushNotifications(
        messages.map(({ _recId: _r, ...m }) => m)
      );

      // Build a map from token → record id for cleanup
      const tokenToRecId = new Map(
        messages.map((m) => [m.to, m._recId])
      );

      for (const chunk of chunks) {
        try {
          const ticketChunk = await expo.sendPushNotificationsAsync(chunk);

          // Check tickets for immediate errors (DeviceNotRegistered, etc.)
          for (let i = 0; i < ticketChunk.length; i++) {
            const ticket = ticketChunk[i];
            const token = chunk[i]?.to;
            if (ticket.status === "error") {
              failed++;
              if (
                ticket.details?.error === "DeviceNotRegistered" &&
                token
              ) {
                const recId = tokenToRecId.get(token as string);
                if (recId) {
                  try {
                    await pb.collection("expo_push_tokens").delete(recId);
                  } catch {
                    /* ignore */
                  }
                }
              }
            } else {
              sent++;
            }
          }
        } catch (err) {
          console.error("[push] expo chunk send error:", err);
          failed += chunk.length;
        }
      }
    }
  } catch (err) {
    console.error("[push] expo channel error:", err);
  }

  // ── FCM v1 channel (raw Android device tokens) ─────────────────────────────
  try {
    const fcmRecords = nativeTokenRecords.items.filter(
      (rec) =>
        !Expo.isExpoPushToken((rec as any).token) &&
        (rec as any).platform === "android" &&
        (rec as any).token
    );

    if (fcmRecords.length > 0) {
      const tokenToRecId = new Map<string, string>(
        fcmRecords.map((rec) => [(rec as any).token as string, rec.id])
      );
      const result = await sendFcmV1([...tokenToRecId.keys()], payload);
      sent += result.sent;
      failed += result.failed;

      for (const deadToken of result.dead) {
        const recId = tokenToRecId.get(deadToken);
        if (recId) {
          try {
            await pb.collection("expo_push_tokens").delete(recId);
          } catch {
            /* ignore */
          }
        }
      }
    }
  } catch (err) {
    console.error("[push] fcm channel error:", err);
  }

  return { sent, failed };
}
