/**
 * Localiza el `label`/`description` de los 8 widgets de Android (#811) que
 * `react-native-android-widget` escribe FIJOS en el idioma que traiga
 * `app.json`, sea cual sea el idioma del dispositivo.
 *
 * Investigado en el plugin instalado
 * (node_modules/react-native-android-widget/app.plugin.js):
 *
 *   - `label` → NO pasa por recurso: `withWidgetReceiver` escribe
 *     `android:label="${widget.label}"` a pelo en el `<receiver>` del manifest.
 *   - `description` → `withWidgetDescriptions` la mete en `res/values/strings.xml`
 *     como `widget_<name>_description` con `translatable="false"`, y el
 *     `<appwidget-provider>` apunta a `@string/widget_<name>_description`.
 *     Solo escribe ese fichero y no hay parámetro de idioma.
 *
 * Ninguno de los dos valida el contenido, así que `app.json` les pasa
 * REFERENCIAS en vez de texto: `label` = `@string/widget_<name>_label` y
 * `description` = `@string/widget_<name>_desc`. La description queda como un
 * alias (`<string name="widget_x_description">@string/widget_x_desc</string>`)
 * que Android resuelve al recurso localizado. Este plugin crea esos recursos
 * en `values/` (inglés, el idioma por defecto) y `values-es/` (español):
 * Android elige la carpeta según el idioma del sistema.
 *
 * Dos trampas que obligan a NO marcar estos recursos `translatable="false"`:
 *   - El `format()` de Expo NO escapa los strings `translatable="false"`, y un
 *     apóstrofo sin escapar («Today's workout») rompe aapt2 al compilar.
 *   - Un recurso `translatable="false"` con traducción en `values-es/` es el
 *     aviso `ExtraTranslation` de lint, de severidad Fatal: `lintVitalRelease`
 *     tumba el `bundleRelease`. Por eso la description no se traduce sobre el
 *     `widget_<name>_description` de la librería (que sí es `translatable="false"`),
 *     sino con el alias a un recurso propio.
 *
 * `withStringsXml` solo escribe en `values/`, así que `values-es/` usa
 * `withDangerousMod` con las mismas utilidades que `AndroidConfig.Strings`
 * (`getProjectStringsXMLPathAsync` acepta `kind: 'values-es'`).
 */
const { withStringsXml, withDangerousMod, AndroidConfig, XML } = require('expo/config-plugins')

const { Resources, Strings } = AndroidConfig

// Nombre del widget (tal cual en app.json) → label y description, en/es.
const WIDGET_STRINGS = {
  TodayWidget: {
    label: { en: "Today's workout", es: 'Entrenamiento de hoy' },
    desc: { en: "Today's workout, week and streak", es: 'Qué toca hoy, semana y racha' },
  },
  CardioWidget: {
    label: { en: 'Cardio', es: 'Cardio' },
    desc: { en: "This week's km and last session", es: 'Km de la semana y última sesión' },
  },
  NutritionWidget: {
    label: { en: 'Nutrition', es: 'Nutrición' },
    desc: { en: "Today's calories and macros + quick log", es: 'Calorías y macros de hoy + registro rápido' },
  },
  NutritionRingWidget: {
    label: { en: 'Calories', es: 'Calorías' },
    desc: { en: "Today's calorie ring", es: 'Anillo de calorías de hoy' },
  },
  StreakWidget: {
    label: { en: 'Streak', es: 'Racha' },
    desc: { en: 'Consecutive training days and the week', es: 'Días seguidos entrenando y la semana' },
  },
  MealStreakWidget: {
    label: { en: 'Meal streak', es: 'Racha de comidas' },
    desc: { en: 'Consecutive days with an A/B food score', es: 'Días seguidos con score de comida A/B' },
  },
  WaterWidget: {
    label: { en: 'Water', es: 'Agua' },
    desc: { en: "Today's water glasses vs. your goal", es: 'Vasos de agua de hoy vs. tu meta' },
  },
  NextSessionWidget: {
    label: { en: 'Next session', es: 'Próxima sesión' },
    desc: { en: "Tomorrow's workout, in a thin strip", es: 'Qué toca mañana, en una franja fina' },
  },
}

/** Recursos de un idioma: `widget_<name>_label` y `widget_<name>_desc`. */
function buildItems(lang) {
  return Object.entries(WIDGET_STRINGS).flatMap(([name, { label, desc }]) => [
    Resources.buildResourceItem({ name: `widget_${name.toLowerCase()}_label`, value: label[lang] }),
    Resources.buildResourceItem({ name: `widget_${name.toLowerCase()}_desc`, value: desc[lang] }),
  ])
}

/** `values/strings.xml`: inglés, el idioma por defecto. */
function withWidgetStringsEn(config) {
  return withStringsXml(config, (cfg) => {
    cfg.modResults = Strings.setStringItem(buildItems('en'), cfg.modResults)
    return cfg
  })
}

/**
 * `values-es/strings.xml`: no hay mod nativo para otro idioma, se lee y escribe
 * a mano. Lleva también `app_name`: en cuanto existe `values-es/`, el
 * `app_name` de `values/` (traducible) sin su versión española es el aviso
 * `MissingTranslation` de lint. El nombre de la app no se traduce.
 */
function withWidgetStringsEs(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const filePath = await Strings.getProjectStringsXMLPathAsync(cfg.modRequest.projectRoot, { kind: 'values-es' })
      const xml = await Resources.readResourcesXMLAsync({ path: filePath })
      const items = [Resources.buildResourceItem({ name: 'app_name', value: cfg.name }), ...buildItems('es')]
      await XML.writeXMLAsync({ path: filePath, xml: Strings.setStringItem(items, xml) })
      return cfg
    },
  ])
}

module.exports = function withWidgetStrings(config) {
  return withWidgetStringsEs(withWidgetStringsEn(config))
}
