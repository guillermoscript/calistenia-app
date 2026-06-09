/**
 * Tema para react-navigation (headers, fondos de stack, etc.).
 * Mismos valores HSL que src/global.css / apps/web/src/index.css.
 */
import { DarkTheme, DefaultTheme } from 'expo-router'

export const NAV_THEME = {
  light: {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: 'hsl(60 6% 97%)',
      border: 'hsl(60 4% 87%)',
      card: 'hsl(0 0% 100%)',
      notification: 'hsl(0 84.2% 60.2%)',
      primary: 'hsl(0 0% 12%)',
      text: 'hsl(0 0% 8%)',
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: 'hsl(0 0% 3.9%)',
      border: 'hsl(0 0% 14.9%)',
      card: 'hsl(0 0% 7%)',
      notification: 'hsl(0 62.8% 50%)',
      primary: 'hsl(0 0% 98%)',
      text: 'hsl(0 0% 98%)',
    },
  },
} as const
