# Registro de ayunos — primera versión

Web y app nativa comparten sesiones y metas en PocketBase a través de `useFasting`.

## Comportamiento

- Nutrición añade Ayunos junto a Hoy y Planificar, disponible sin configurar macros.
- Cada sesión guarda inicio UTC, final UTC opcional, duración objetivo y notas.
- Los editores usan la zona horaria del perfil y los helpers Intl compatibles con Hermes. Se rechazan fechas inexistentes y horas saltadas por un cambio de horario; una hora local repetida se interpreta como su primera aparición. Una edición sin cambiar la fecha conserva el instante original, incluidos sus segundos.
- Metas: duración de 1–48 horas (opciones 12, 14, 16, 18, 20, 24, 36 y 48) y 1–7 sesiones semanales.
- El temporizador se calcula desde las fechas guardadas. Alcanzar la meta no termina la sesión automáticamente.
- En nativo, el reloj deja de actualizar la interfaz cuando la app pasa a segundo plano y recalcula el tiempo real al volver. El ayuno continúa registrado aunque el proceso se cierre.
- Se puede iniciar ahora, indicar un inicio anterior, finalizar, registrar sesiones pasadas, editar y eliminar con confirmación.
- El servidor rechaza fechas futuras, finales anteriores al inicio, sesiones superpuestas, dos sesiones activas y cambios de propietario. Las sesiones consecutivas pueden compartir el instante de final/inicio.
- Una sesión de varios días cuenta una sola vez. Las estadísticas semanales y mensuales asignan cada sesión al día de finalización, en la zona horaria del perfil. Las horas del periodo son las duraciones completas de esas sesiones.
- El historial y el temporizador se guardan localmente por usuario. Las escrituras requieren confirmación del servidor: ante un fallo de conexión se conserva el registro anterior y el formulario permite reintentar.
- Las metas de duración son preferencias del usuario. La interfaz contextualiza los ayunos de 24 horas o más sin recomendar extenderlos.

## Puesta en marcha

Aplicar `pb_migrations/1791072000_created_fasting.js` y publicar `pb_hooks/fasting.pb.js` y `pb_hooks/utils/fasting.js` antes de distribuir los nuevos clientes web y nativo. Un servidor sin la migración muestra un aviso y permite reintentar, conservando los registros ya almacenados en el dispositivo.

Esta versión registra sesiones y metas; la programación de próximos ayunos, las notificaciones y el cierre vinculado a una comida quedan para una integración posterior.

## Verificación

- Pruebas de lógica compartida: UTC, fechas inválidas, cambios de hora, sesiones de 48 horas, objetivos, superposiciones y límites de semana/mes.
- Pruebas de persistencia: recuperación sin conexión, conservación de una sesión si falla la escritura y aislamiento entre cuentas.
- Prueba de escritura pendiente al cambiar de cuenta: una respuesta de la cuenta anterior no puede reemplazar la caché de la cuenta actual. La caché también se elimina al cerrar sesión.
- Pruebas de interfaz web: registro anterior, edición sin perder segundos, finalización explícita y errores.
- Pruebas del reloj nativo: pausa en segundo plano, recuperación tras una hora, inicio con AppState sin resolver, eventos repetidos y limpieza de temporizador/suscripción.
- Pruebas reales de PocketBase con base temporal: privacidad, propietario inmutable, registros simultáneos y validaciones.
- Tipos de core, web y nativo; lint de hooks y dependencias; compilación web y exportación de JavaScript Android.

La exportación Android verifica la integración de JavaScript/Hermes; no equivale a construir o instalar un APK. Sigue pendiente comprobar visualmente el flujo completo en un dispositivo o simulador nativo, incluidos teclado, modales y vuelta desde segundo plano.
