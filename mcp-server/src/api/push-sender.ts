import webpush from "web-push";
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

  const subs = await pb.collection("push_subscriptions").getList(1, 20, {
    filter: pb.filter("user = {:uid}", { uid: userId }),
  });

  let sent = 0;
  let failed = 0;

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

  return { sent, failed };
}
