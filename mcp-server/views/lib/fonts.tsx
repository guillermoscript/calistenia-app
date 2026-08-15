/**
 * Self-hosted @font-face injection for widgets — mirrors the app's Bebas
 * Neue / JetBrains Mono / DM Sans identity inside the sandboxed widget iframe.
 *
 * mcp-use v2 serves files under `public/` at `{basePath}/_mcp-use/public/*`
 * and injects the request-resolved prefix into every View document;
 * `getPublicBaseUrl()` (trailing slash included) is the documented way to
 * address same-origin public assets from View code, and stays correct behind
 * proxies/tunnels.
 *
 * Every View renders <WidgetFonts/> once at its root. See [[lib/theme]] for
 * the FONT/FONT_DISPLAY/FONT_MONO stacks that reference these families.
 */
import { getPublicBaseUrl } from "mcp-use/react";

function publicAsset(file: string): string {
  return `${getPublicBaseUrl()}fonts/${file}`;
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
