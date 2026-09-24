/**
 * Localiza el `label`/`description` de los 8 widgets de Android (#811) que
 * `react-native-android-widget` escribe FIJOS en el idioma que traiga
 * `app.json`, sea cual sea el idioma del dispositivo.
 *
 * Investigado en el plugin instalado
 * (node_modules/react-native-android-widget/app.plugin.js):
 *
 *   - `description` → SÍ pasa por un recurso: `withWidgetDescriptions` mete
 *     `widget.description` en `res/values/strings.xml` (el locale POR
 *     DEFECTO) bajo el nombre `widget_<name lowercase>_description`, y el
 *     `<appwidget-provider>` apunta a `@string/widget_<name>_description`.
 *     Pero solo escribe ESE fichero — no hay parámetro de locale, así que solo
 *     puede haber un idioma sin ayuda externa.
 *   - `label` → NO pasa por recurso. `withWidgetReceiver` hace
 *     `'android:label': `${widget.label ?? widget.name}`` — un literal
 *     interpolado a pelo en el `<receiver>` del manifest, no una referencia.
 *     Como no valida el contenido, pasarle NOSOTROS la cadena
 *     `@string/widget_<name>_label` cuela igual: aapt2 solo exige que el
 *     recurso EXISTA al enlazar, no que la propia librería lo haya creado.
 *
 * Solución: `app.json` lleva `label` como `@string/widget_<name>_label` y
 * `description` en INGLÉS (el idioma por defecto — así el recurso que
 * autogenera `react-native-android-widget` en `values/strings.xml` ya sale en
 * inglés sin tocar su código). Este plugin añade lo que el oficial no sabe
 * hacer:
 *   1. `widget_<name>_label` en INGLÉS a `res/values/strings.xml` (el label no
 *      lo escribe nadie más).
 *   2. `widget_<name>_label` + `widget_<name>_description` en ESPAÑOL a
 *      `res/values-es/strings.xml`. Android resuelve el recurso por CARPETA
 *      según el idioma del sistema: un móvil en español lee esto, cualquier
 *      otro idioma cae al inglés de `values/`.
 *
 * No hay mod de Expo para un `values-<locale>/strings.xml` que no sea el por
 * defecto (`withStringsXml` siempre apunta a `values/`), así que el paso 2 usa
 * `withDangerousMod` + las mismas utilidades de bajo nivel que usa
 * `AndroidConfig.Strings` por dentro (`getProjectStringsXMLPathAsync` acepta
 * `kind: 'values-es'`).
 *
 * VERIFICADO con `expo prebuild --platform android --no-install` (2026-09-24):
 * los 8 `<receiver>` del AndroidManifest.xml generado quedan con
 * `android:label="@string/widget_todaywidget_label"` (etc.), y tanto
 * `res/values/strings.xml` como `res/values-es/strings.xml` traen las 8
 * entradas de label (+ 8 de description en `values-es`) esperadas.
 */
const { withStringsXml, withDangerousMod, AndroidConfig, XML } = require('expo/config-plugins')

const { Resources, Strings } = AndroidConfig

// Nombre del widget (tal cual en app.json) → texto de su label, es/en.
const WIDGET_LABELS = {
  TodayWidget: { en: "Today's workout", es: 'Entrenamiento de hoy' },
  CardioWidget: { en: 'Cardio', es: 'Cardio' },
  NutritionWidget: { en: 'Nutrition', es: 'Nutrición' },
  NutritionRingWidget: { en: 'Calories', es: 'Calorías' },
  StreakWidget: { en: 'Streak', es: 'Racha' },
  MealStreakWidget: { en: 'Meal streak', es: 'Racha de comidas' },
  WaterWidget: { en: 'Water', es: 'Agua' },
  NextSessionWidget: { en: 'Next session', es: 'Próxima sesión' },
}

// Traducción española de la `description` que `app.json` ya trae en inglés
// (react-native-android-widget escribe ESE inglés en `values/`; aquí solo se
// aporta el `values-es/` que él no sabe generar). Debe leerse igual que el
// `description` de cada widget en app.json, solo que en español.
const WIDGET_DESCRIPTIONS_ES = {
  TodayWidget: 'Qué toca hoy, semana y racha',
  CardioWidget: 'Km de la semana y última sesión',
  NutritionWidget: 'Calorías y macros de hoy + registro rápido',
  NutritionRingWidget: 'Anillo de calorías de hoy',
  StreakWidget: 'Días seguidos entrenando y la semana',
  MealStreakWidget: 'Días seguidos con score de comida A/B',
  WaterWidget: 'Vasos de agua de hoy vs. tu meta',
  NextSessionWidget: 'Qué toca mañana, en una franja fina',
}

const labelResourceName = (widgetName) => `widget_${widgetName.toLowerCase()}_label`
const descriptionResourceName = (widgetName) => `widget_${widgetName.toLowerCase()}_description`

/** `values/strings.xml` (inglés, el locale por defecto): solo los labels — la
 * description en inglés ya la escribe `react-native-android-widget` a partir
 * del texto que trae `app.json`. */
function withWidgetLabelsEn(config) {
  return withStringsXml(config, (cfg) => {
    const items = Object.entries(WIDGET_LABELS).map(([name, { en }]) =>
      Resources.buildResourceItem({ name: labelResourceName(name), value: en, translatable: false }),
    )
    cfg.modResults = Strings.setStringItem(items, cfg.modResults)
    return cfg
  })
}

/** `values-es/strings.xml`: label + description en español. Sin mod nativo
 * para un locale que no sea el por defecto, así que se lee/escribe a mano. */
function withWidgetStringsEs(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot
      const filePath = await Strings.getProjectStringsXMLPathAsync(projectRoot, { kind: 'values-es' })
      const xml = await Resources.readResourcesXMLAsync({ path: filePath })

      const items = [
        ...Object.entries(WIDGET_LABELS).map(([name, { es }]) =>
          Resources.buildResourceItem({ name: labelResourceName(name), value: es, translatable: false }),
        ),
        ...Object.entries(WIDGET_DESCRIPTIONS_ES).map(([name, es]) =>
          Resources.buildResourceItem({ name: descriptionResourceName(name), value: es, translatable: false }),
        ),
      ]

      await XML.writeXMLAsync({ path: filePath, xml: Strings.setStringItem(items, xml) })
      return cfg
    },
  ])
}

module.exports = function withWidgetStrings(config) {
  return withWidgetStringsEs(withWidgetLabelsEn(config))
}
