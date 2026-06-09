import * as Sentry from "@sentry/react";

// Detect language early (before i18n loads) — mirrors i18next detection order
const detectedLang = localStorage.getItem("i18nextLng") || navigator.language || "es";
const isSpanish = detectedLang.startsWith("es");

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
      ...(isSpanish
        ? {
            triggerLabel: "Reportar problema",
            formTitle: "¿Algo no funciona?",
            nameLabel: "Tu nombre",
            namePlaceholder: "Ej: María",
            emailLabel: "Correo (para respuesta)",
            emailPlaceholder: "tu@correo.com",
            messageLabel: "¿Qué ocurrió?",
            messagePlaceholder:
              "Describe lo que hiciste, qué salió mal y qué esperabas que pasara",
            submitButtonLabel: "Enviar reporte",
            cancelButtonLabel: "Cancelar",
            successMessageText:
              "¡Recibido! Revisaremos tu reporte lo antes posible.",
            addScreenshotButtonLabel: "Adjuntar captura",
            removeScreenshotButtonLabel: "Quitar captura",
            isRequiredLabel: "(obligatorio)",
          }
        : {
            triggerLabel: "Report issue",
            formTitle: "Something not working?",
            nameLabel: "Your name",
            namePlaceholder: "E.g. Alex",
            emailLabel: "Email (for follow-up)",
            emailPlaceholder: "you@email.com",
            messageLabel: "What happened?",
            messagePlaceholder:
              "Describe what you did, what went wrong, and what you expected",
            submitButtonLabel: "Send report",
            cancelButtonLabel: "Cancel",
            successMessageText:
              "Got it! We'll look into this as soon as possible.",
            addScreenshotButtonLabel: "Attach screenshot",
            removeScreenshotButtonLabel: "Remove screenshot",
            isRequiredLabel: "(required)",
          }),
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
