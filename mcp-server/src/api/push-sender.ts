import webpush from "web-push";
import { Expo } from "expo-server-sdk";
import { getAdminPB } from "./admin-pb.js";

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

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  const pb = await getAdminPB();

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

  // ── Expo Push channel ─────────────────────────────────────────────────────
  try {
    const expoTokenRecords = await pb
      .collection("expo_push_tokens")
      .getList(1, 20, {
        filter: pb.filter("user = {:uid}", { uid: userId }),
      });

    const messages = expoTokenRecords.items
      .filter((rec) => Expo.isExpoPushToken((rec as any).token))
      .map((rec) => ({
        _recId: rec.id,
        to: (rec as any).token as string,
        title: payload.title,
        body: payload.body,
        sound: "default" as const,
        data: { url: payload.url },
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

  return { sent, failed };
}
