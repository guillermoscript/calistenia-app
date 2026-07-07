/**
 * Self-hosted @font-face injection for widgets — mirrors the app's Bebas
 * Neue / JetBrains Mono / DM Sans identity inside the sandboxed widget iframe.
 *
 * mcp-use serves files under `public/` at `{baseUrl}/mcp-use/public/*` and
 * injects `window.__mcpPublicUrl = "{baseUrl}/mcp-use/public"` into every
 * widget's HTML head (see mcp-use's processWidgetHtml). Reading that global
 * at render time — rather than guessing a relative/absolute URL against
 * `<base href>` — is the documented, robust way to address same-origin
 * public assets from widget code.
 *
 * Every widget renders <WidgetFonts/> once at its root, alongside
 * <McpUseProvider>. See [[lib/theme]] for the FONT/FONT_DISPLAY/FONT_MONO
 * stacks that reference these families.
 */
function publicAsset(file: string): string {
  const base =
    typeof window !== "undefined"
      ? (window as unknown as { __mcpPublicUrl?: string }).__mcpPublicUrl ?? ""
      : "";
  return `${base}/fonts/${file}`;
}

export function WidgetFonts() {
  return (
    <style>{`
      @font-face {
        font-family: 'Bebas Neue';
        src: url('${publicAsset("BebasNeue_400Regular.ttf")}') format('truetype');
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: 'JetBrains Mono';
        src: url('${publicAsset("JetBrainsMono_400Regular.ttf")}') format('truetype');
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: 'JetBrains Mono';
        src: url('${publicAsset("JetBrainsMono_700Bold.ttf")}') format('truetype');
        font-weight: 700;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: 'DM Sans';
        src: url('${publicAsset("DMSans_500Medium.ttf")}') format('truetype');
        font-weight: 500;
        font-style: normal;
        font-display: swap;
      }
    `}</style>
  );
}
