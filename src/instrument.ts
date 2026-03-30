import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "https://45325daff5446587024f972577dbbb70@o4507789962706944.ingest.us.sentry.io/4511134403723264",
  environment: import.meta.env.MODE,
  release: `calistenia-app@${__APP_VERSION__}`,

  sendDefaultPii: true,

  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
    Sentry.feedbackIntegration({
      colorScheme: "system",
      enableScreenshot: true,
      triggerLabel: "Bug",
    }),
  ],

  beforeSend(event, hint) {
    if (event.exception && event.event_id) {
      Sentry.showReportDialog({ eventId: event.event_id });
    }
    return event;
  },

  // Tracing — 1.0 in dev, lower in production
  tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
  tracePropagationTargets: ["localhost", import.meta.env.VITE_API_ORIGIN || "https://gym-server.guille.tech"],

  // Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Logs
  enableLogs: true,
});
