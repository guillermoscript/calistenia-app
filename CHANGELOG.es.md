# Registro de cambios — Calistenia (móvil)

Aquí se documentan todos los cambios relevantes de la app móvil de Calistenia.
El formato se basa en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/) y el proyecto sigue el [Versionado Semántico](https://semver.org/lang/es/).

> Generado a partir de notas de versión curadas con ayuda de IA — no editar a mano. Fuente: `packages/core/data/changelog.mobile.json` · regenera con `pnpm changelog:md`. La versión en inglés está en [`CHANGELOG.md`](./CHANGELOG.md).

## [Sin publicar]

_Nada por ahora._

## [1.3.1] - 2026-07-14

_Mejoras y correcciones de esta versión._

### Añadido

- **mobile** — Rediseño UI de bloqueo — menú ⋯ en perfil, variant danger, banner bloqueado

## [1.3.0] - 2026-07-14

_Ahora puedes bloquear usuarios: su actividad desaparece para ti en toda la app._

### Añadido

- **Bloquear usuarios** — Bloquea a cualquier usuario desde su perfil: se dejan de seguir mutuamente y su actividad desaparece del feed, comentarios, reacciones, rankings y retos.
- **Gestión de bloqueados** — Nueva pantalla en tu perfil para ver y desbloquear usuarios cuando quieras.
- **Sin ruido** — Un usuario bloqueado no puede comentar tu actividad, seguirte ni enviarte notificaciones.

## [1.2.1] - 2026-07-13

_Mejoras y correcciones de esta versión._

### Añadido

- **web** — Página de eliminación de cuenta para Google Play
- **web** — Página de política de privacidad para Google Play
- **mcp** — Widgets visuales para despensa y recetas (8 nuevos, 19 total) (#202)
- **deps** — Tailwindcss+vitest bumps in apps/web (#146 parte 3a) — Vite 8 reverted, blocked upstream (#200)

## [1.2.0] - 2026-07-10

_Carreras por tiempo con ranking real y countdown en rojo, y tu sesión offline ya no te desloguea ni pierde datos._

### Añadido

- **Ranking real en carreras por tiempo** — En carreras a tiempo fijo ahora se ordena por distancia recorrida, no por quién sincronizó antes. El ganador se marca como "Recorrió más".
- **Countdown final en rojo** — Los últimos 10 segundos de carrera se ven en rojo con vibración y sonido en cada segundo, para que sepas exactamente cuándo apretar.

### Corregido

- **Sin conexión ya no te desloguea** — Abrir la app sin internet mantenía tu sesión, pero por un bug te deslogueaba y podía perder entrenamientos guardados sin conexión. Arreglado: tu sesión y tus datos offline ahora sobreviven arranques sin red.
- **El cero ahora cuenta** — Poner un macro en 0g o un descanso de circuito en 0s se guardaba como valor por defecto en vez de respetar el cero que elegiste. Ya se respeta.

### Seguridad

- **Dependencias actualizadas** — Actualizamos el SDK de PocketBase y parcheamos una vulnerabilidad de bajo impacto en una librería interna.

## [1.1.0] - 2026-07-03

_Tus insights semanales evolucionan: historial, tendencias, una sugerencia accionable y un resumen automático cada lunes._

### Añadido

- **Tus semanas: historial de insights** — Una nueva pantalla reúne tus resúmenes semanales anteriores para ver patrones a lo largo del tiempo. Fíltralos por semana o mes.
- **Sugerencia accionable** — Cuando encaja, tu resumen propone una acción concreta y te lleva a ella de un toque (recordatorios, nutrición o una sesión libre).
- **Tendencia de la semana** — Cada resumen muestra si vas mejor, igual o peor que la semana anterior con una señal ↑ / → / ↓.
- **Resumen automático cada lunes** — Ya no hace falta generarlo a mano: cada lunes por la mañana preparamos tu resumen y te avisamos con una notificación.

## [1.0.9] - 2026-07-03

_Insights que cruzan tus métricas de la semana, y el catálogo crece a 1,578 ejercicios con filtros y retos._

### Añadido

- **Insights de tu semana** — La app cruza tu sueño, entrenos, nutrición, agua y peso para mostrarte patrones de tu semana con una sugerencia accionable. Tócalo en "Generar resumen" desde Inicio.
- **Catálogo ampliado a 1,578 ejercicios** — El catálogo pasa de 307 a 1,578 ejercicios, con nombres e instrucciones en español (98% con descripción). Por ahora sin GIFs de terceros.
- **Filtros de biblioteca en móvil** — Filtra la biblioteca por dificultad, equipo y grupo muscular — igual que en la web.
- **Filtro "Sin equipo"** — Nuevo filtro para ver solo ejercicios de puro peso corporal (454 en el catálogo).
- **Grupos musculares y variantes por nivel** — Chips de filtro por 15 grupos musculares canónicos, y una nueva sección "Variantes" en cada ejercicio agrupada por nivel — más fáciles, mismo nivel, más difíciles.
- **Ejercicios relacionados** — Cada ejercicio ahora sugiere "Relacionados" — movimientos parecidos por músculos que no son variaciones del mismo ejercicio.
- **Retos por ejercicio** — Crea un reto sobre cualquier ejercicio del catálogo (p. ej. "PR de dominadas en 30 días") desde la web; el leaderboard puntúa tu mejor set registrado.
- **PRs con peso extra** — Los récords personales ahora estiman tu e1RM al registrar peso extra (lastre).
- **Sesión libre IA sin gimnasio por defecto** — La sesión libre con IA excluye ejercicios de gimnasio salvo que actives incluirlos.

### Corregido

- **Traducciones corregidas** — 8 ejercicios (como Muscle up) ya no muestran su descripción en inglés con la app en español, y el chip de dificultad en el detalle del ejercicio ahora se traduce correctamente.

## [1.0.7] - 2026-06-24

_Cuando el análisis de una foto de comida falla, ahora ves el error real en vez de un fallo silencioso._

### Corregido

- **Errores de análisis de comida más claros** — Si el análisis de una foto de comida falla, la app te muestra el mensaje real del error para que sepas qué pasó. Además, los fallos se reportan automáticamente para corregirlos antes.

## [1.0.6] - 2026-06-24

_Elige el tema de la app —claro, oscuro o automático— y reabre las novedades cuando quieras para ver todas las versiones._

### Añadido

- **Tema claro y oscuro** — Cambia entre modo claro, oscuro o el del sistema desde tu perfil. Tu elección se recuerda al reabrir la app.
- **Historial de novedades** — Abre las novedades cuando quieras desde tu perfil y revisa todas las versiones anteriores.

## [1.0.5] - 2026-06-24

_Circuitos y entrenos cronometrados, importa datos de tu reloj y comparte tu nutrición con estilo._

### Añadido

- **Circuitos en sesión libre** — Arma circuitos con rondas, descanso entre ejercicios y entre rondas — y entrénalos con un cronómetro a pantalla completa.
- **Entrenos cronometrados** — Modo cronometrado: define el tiempo de trabajo y descanso de cada ejercicio y deja que la app te guíe.
- **Importa datos de tu reloj** — Conecta Health Connect para traer pasos, sueño, frecuencia cardíaca, peso y más a tu calendario y nutrición.
- **Comparte tu nutrición** — Nuevas tarjetas de nutrición para compartir tu día con las miniaturas, nombres y macros de cada comida.

### Corregido

- **Mapas de cardio al compartir** — Arreglado el mapa en blanco al compartir tus sesiones de cardio: la ruta vuelve a verse.

## [1.0.4] - 2026-06-22

_Calendario unificado, horario de comidas y un repaso completo de tus sesiones pasadas._

### Añadido

- **Calendario unificado** — Ve toda tu actividad — entrenos, cardio, comidas, sueño, agua y peso — en una sola vista mensual.
- **Horario de comidas** — Registra cuándo comes y cuánto dura cada comida, con una puntuación diaria de calidad nutricional.
- **Detalle de sesiones pasadas** — Toca cualquier entreno o cardio anterior para ver el desglose completo: series, reps, ruta y mapa.
- **Menú de acceso rápido** — Un nuevo menú ☰ te lleva en un toque a sesiones libres, comunidad, carreras y recordatorios.
- **Plantillas de sesión libre** — Guarda tus sesiones de IA y reutilízalas cuando quieras, sin volver a generarlas.
- **Ejercicios más claros** — Los ejercicios ahora incluyen indicaciones de tempo y mejores demos para cuidar tu técnica.

### Corregido

- **Controles en pantalla bloqueada** — Tu entreno y cardio en vivo ahora se ven y se controlan desde la pantalla bloqueada (incl. Xiaomi/MIUI).

### Cambiado

- **App más fluida** — Repaso de rendimiento en varias pantallas para que todo vaya más ligero.

## [1.0.3] - 2026-06-19

_Notificaciones push y más actividad social._

### Añadido

- **Notificaciones push** — Recibe avisos cuando tus amigos logran rachas, terminan entrenos o te dan un toque.
- **Actividad de amigos** — Las rachas, logros y entrenos de tus amigos ahora aparecen en tu feed y notificaciones.

## [1.0.2] - 2026-06-17

_Feed de actividad, tarjetas para compartir y un final de sesión con más chispa._

### Añadido

- **Feed de actividad** — Ve la actividad reciente de tus amigos y la tuya en el inicio, con búsqueda y filtros de programas.
- **Final de sesión con chispa** — Confetti, frases dinámicas y animaciones de tiempos al terminar tu entreno.
- **Tarjetas para compartir** — Comparte tu racha y el resumen de tu sesión como imagen.

### Corregido

- **Arreglo de inicio con Google** — Soluciona el cuelgue infinito al iniciar sesión con Google en Honor/MagicOS.

## [1.0.1] - 2026-06-15

_Comentarios renovados con push, recordatorios locales y mejor rendimiento._

### Añadido

- **Comentarios renovados** — Nueva interfaz de comentarios con teclado nativo y notificaciones push para comentarios y reacciones.
- **Recordatorios locales** — Programa recordatorios de entreno directamente en tu teléfono.

### Cambiado

- **Mejor rendimiento de datos** — Carga y sincronización de datos más rápidas.

## [1.0.0] - 2026-06-13

_Primera versión de la app móvil: onboarding, programas, nutrición con IA y sesiones guiadas._

### Añadido

- **Primera versión móvil** — La app de Calistenia llega a Android con tu programa, sesiones y progreso.
- **Onboarding inteligente** — Te emparejamos con los programas ideales según tu nivel y objetivos.
- **Registro de comidas con IA** — Registra comidas describiéndolas en texto y deja que la IA calcule los macros.
- **Sesiones guiadas** — Entrena con sesiones paso a paso que respetan tus articulaciones lesionadas.

[unreleased]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.3.1...HEAD
[1.3.1]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.3.0...mobile-v1.3.1
[1.3.0]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.2.1...mobile-v1.3.0
[1.2.1]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.2.0...mobile-v1.2.1
[1.2.0]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.1.0...mobile-v1.2.0
[1.1.0]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.0.9...mobile-v1.1.0
[1.0.9]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.0.7...mobile-v1.0.9
[1.0.7]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.0.6...mobile-v1.0.7
[1.0.6]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.0.5...mobile-v1.0.6
[1.0.5]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.0.4...mobile-v1.0.5
[1.0.4]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.0.3...mobile-v1.0.4
[1.0.3]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.0.2...mobile-v1.0.3
[1.0.2]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.0.1...mobile-v1.0.2
[1.0.1]: https://github.com/guillermoscript/calistenia-app/compare/mobile-v1.0.0...mobile-v1.0.1
[1.0.0]: https://github.com/guillermoscript/calistenia-app/releases/tag/mobile-v1.0.0
