/**
 * Mismas fuentes que apps/web (index.html → Google Fonts): Bebas Neue para
 * display, DM Sans 400/500/700 para cuerpo y JetBrains Mono 400/600/700 para
 * números/labels. Cada peso es una familia distinta en RN — se referencian por
 * nombre exacto desde tailwind.config.js (font-bebas, font-sans*, font-mono*).
 */
import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue'
import {
  DMSans_400Regular,
  DMSans_400Regular_Italic,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans'
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono'

export const FONTS = {
  BebasNeue_400Regular,
  DMSans_400Regular,
  DMSans_400Regular_Italic,
  DMSans_500Medium,
  DMSans_700Bold,
  JetBrainsMono_400Regular,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
}
