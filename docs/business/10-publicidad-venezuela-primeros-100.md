# Publicidad para los primeros 100 usuarios (enfoque Venezuela)

> Investigación de mercado + plan ejecutable. Fecha: 2026-08-23
> Contexto: ~10 usuarios captados **solo por SEO**, sin un dólar de publicidad, repartidos por el mundo.
> Complementa (no sustituye) `06-first-100-users-playbook.md`, escrito en 2026-03-28 y no ejecutado.

---

## 1. Cómo se anuncia de verdad la competencia

Hay **dos modelos** y son casi opuestos. Conviene saber en cuál juegas.

### Modelo A — Embudo de quiz pagado (web2app)

Es el de **MadMuscles, BetterMe, Welmi**. Anuncio → quiz larguísimo en web → "plan personalizado" → muro de pago **antes** de descargar la app.

| Dato | Cifra |
|---|---|
| Gasto en YouTube de MadMuscles | ~$29,4M/mes (~$195M en 12 meses) |
| Longitud del quiz | 39–48 pantallas, con variantes por género |
| Embudos paralelos | uno por ángulo: tai chi, militar, **calistenia**, senior, yoga… |

BetterMe hace lo mismo: **docenas de embudos web** distintos, cada uno emparejado con su creatividad de anuncio. La clave no es el quiz: es que **cada anuncio tiene su propia landing**, y el quiz cobra antes de que el usuario llegue a la tienda.

**Qué te llevas de aquí:** la estructura, no el presupuesto. Ya tienes el quiz construido (`quiz-test-*.png`). Lo que te falta es que cada ángulo de anuncio caiga en su propia entrada del quiz, no todos en la home.

**Qué NO te llevas:** competir por impresiones contra alguien que quema $29M/mes. En Meta e YouTube compras en la misma subasta que ellos.

### Modelo B — Influencer y comunidad

Es el de las apps de **calistenia** de verdad:

- **Thenx** — nace *de* un influencer (Chris Heria). La app es la monetización de una audiencia que ya existía.
- **Caliverse** — el fundador (programador, se hizo la app para sí mismo) se cruzó con el *United Calisthenics Group*, que le ayudó con el contenido; la app salió medio año después apoyada en esa comunidad.
- **Madbarz** — comunidad y retos.

**Ninguna app de calistenia relevante se construyó con anuncios fríos.** La calistenia es un deporte de parque, de grupo y de figura visible. La distribución es social, no publicitaria.

> **Conclusión:** tú estás en el modelo B y estás intentando pensar en publicidad como si fueras el modelo A.

---

## 2. La realidad de Venezuela (lo que cambia el plan)

### 2.1 Pagar publicidad desde Venezuela es frágil

- Por las sanciones de la OFAC, Meta lleva años devolviendo *"país con comercio restringido"* al intentar pagar. La cuenta de Ads Manager se **deshabilita si la dirección, la ubicación o el método de pago tienen cualquier vínculo con Venezuela**.
- Google Ads igual: Google debe cumplir OFAC y puede no estar disponible según el país del anunciante.
- En 2026 circulan reportes de que ya se puede pagar Meta y Google Ads **con tarjetas internacionales desde IP venezolana** gracias a 3D Secure, y la vía habitual sigue siendo intermediarios: **Zinli, AirTM, Payoneer, Wally, Uphold, Astropay**.

**Regla práctica:** puedes conseguir que funcione, pero **no construyas tu adquisición sobre una cuenta publicitaria que te pueden desactivar sin aviso** y con el saldo dentro. Si vas a gastar, gasta poco y trata la cuenta como desechable.

> *Supuesto:* asumo que resides o facturas fuera de Venezuela (tienes Play Console, Dokploy, Langfuse pagados). Si es así, este riesgo desaparece y el punto 2.1 no aplica — pero el 2.2 sí.

### 2.2 Venezuela te da usuarios, no dinero

Este es el punto incómodo. Venezuela es probablemente el mercado **más rápido de alcanzar** para ti (idioma, red personal, cultura de barras muy fuerte) y a la vez el **peor para monetizar** de toda la región: penetración de tarjeta mínima, Google Play Billing prácticamente inservible, poder adquisitivo bajo.

Si algún día cobras a venezolanos será por **Zelle, Binance/USDT o pago móvil**, fuera de la tienda — con todo el lío de conciliación manual que eso implica.

**Traducción:** usa Venezuela para conseguir **retención, feedback y prueba social**. Usa España / México / Colombia / Chile para conseguir **ingresos**. No mezcles los objetivos.

### 2.3 Los canales que sí importan allí

| Dato (2026) | Valor |
|---|---|
| Usuarios de internet | 17,6 M (61,6 % de la población) |
| Identidades en redes sociales | 16,6 M (58,1 %) |
| Conexiones móviles activas | 21,8 M (76,3 %) |
| **Facebook** | ~71 % de penetración — la #1 |
| **WhatsApp** | ~70 % — la #2 |
| **TikTok** | +2,59 M de alcance en un año (**+18,5 %**), el que más crece |
| Velocidad móvil | +86 % interanual (pero los datos siguen siendo caros) |

Tres consecuencias directas:

1. **WhatsApp es el canal, no Instagram.** Tu tarjeta de compartir (racha, PR, reto) tiene que estar optimizada para WhatsApp: imagen + link corto, que se vea bien en un status y en un grupo.
2. **TikTok es donde está el crecimiento**, y además es el inventario más barato: CPM $3–7 en LATAM, CPI de fitness ~$2–4,50 y en LATAM (Tier 3) los CPI caen un 60–85 % frente a EE. UU. — rango $0,30–2 por instalación.
3. **Los datos móviles son caros → tu PWA es una ventaja competitiva real.** "No gasta datos instalando, no ocupa espacio" es un argumento de venta en Venezuela que en España no significa nada. Úsalo como ángulo de anuncio explícito.

---

## 3. Diagnóstico: tu cuello de botella no es el alcance

10 usuarios de todo el mundo **sin hacer absolutamente nada** es la señal más valiosa que tienes ahora mismo. Significa que el SEO funciona y que hay demanda entrante. Es el único canal con tracción demostrada, y lo estás ignorando para hablar de publicidad.

El problema de gastar en publicidad hoy es que **no sabes qué compras**:

- ¿Qué % de las visitas empieza el quiz?
- ¿Qué % lo termina y se registra?
- ¿Qué % entrena una segunda vez a los 7 días?

Sin esos tres números, 100 usuarios comprados que se van a la semana te cuestan dinero y no te enseñan nada. Con esos números, sabes cuánto puedes pagar por usuario.

Ya tienes OpenPanel instalado. **Mira esos tres números antes de gastar el primer dólar** — y mira de dónde son los 10 que ya tienes; si ya te llegan de México o España, ahí está tu mercado, no en Venezuela.

---

## 4. Plan de 30 días

Presupuesto total: **$0–150**. Tiempo: ~5 h/semana. Nada de Reddit ni de grupos de Facebook (descartados por coste de tiempo).

### Semana 1 — Instrumentar y afilar (coste: $0)

| Acción | Tiempo |
|---|---|
| Sacar de OpenPanel: visitas → inicio de quiz → registro → retorno a 7 días. Y **el país de los 10 usuarios actuales** | 1 h |
| Verificar que **toda** tarjeta de compartir lleva el link de referido (racha, PR, reto, sesión) y que se ve bien **en WhatsApp** | 1 h |
| Un ángulo = una entrada al quiz. Crear 3 entradas: `/calistenia`, `/sin-gimnasio`, `/nutricion-ia` | 2 h |
| Escribir a los 10 usuarios uno a uno por WhatsApp/email: "¿qué te faltó?" | 1 h |

### Semana 2 — Influencers venezolanos de nicho (coste: $0–50)

Este es el canal de mayor palanca y el que encaja con el modelo B.

1. Busca en TikTok e Instagram: `calistenia Caracas`, `street workout Venezuela`, `barras Maracaibo`, `calistenia Valencia`, `dominadas Barquisimeto`. Directorios como Modash listan influencers de fitness venezolanos filtrables por tamaño.
2. Apunta a **nano (1 k–20 k seguidores)**, no a micro. En LATAM las tarifas ya están 40–50 % por debajo de EE. UU., y los nano venezolanos aceptan **trueque** casi siempre. Si pagas: $50–100 por pieza es el techo razonable.
3. **La oferta no es dinero, es estatus:** un programa dentro de la app **con su nombre y su cara**, un reto de 30 días co-firmado, premium de por vida y un link propio para que vea cuánta gente trajo.
4. Manda **10 mensajes**, espera 2–3 respuestas, cierra 1. Con uno solo de 5 k seguidores bien alineado te llevas 30–80 registros.

### Semana 3 — El reto como motor (coste: $0)

Ya tienes retos y batallas construidos. Un reto es la única razón por la que alguien invita a un amigo **sin que se lo pidas**.

- Lanza un **"Reto 30 días de calistenia"** con fecha de inicio fija, co-firmado con el influencer de la semana 2.
- Requisito de diseño: **para competir hay que invitar**. Batalla 1v1 → el compartir es la mecánica, no un botón secundario.
- Difusión: status de WhatsApp del influencer + el tuyo + los grupos de los parques de barras de tu ciudad. Los grupos de WhatsApp de parque son el equivalente venezolano de Reddit, y a diferencia de Reddit no exigen semanas de presencia previa.
- Presencial: tarjetas con QR en 2–3 parques de barras. Barato y convierte porque hay conversación de por medio.

### Semana 4 — Ahí sí, publicidad pagada (coste: $50–100)

Solo si las semanas 1–3 mostraron que la gente que entra **vuelve**. Si el retorno a 7 días está por debajo del 20 %, **no gastes**: arregla el producto.

| Plataforma | Presupuesto | Geo | Por qué |
|---|---|---|---|
| **Google Search en español** | $3–4/día, 10 días | México, Colombia, España, Chile, Perú | Máxima intención. La gente busca "app de calistenia". **No incluyas Venezuela**: poco volumen de búsqueda y cero monetización |
| **TikTok** (opcional) | $3/día, 7 días | LATAM | Inventario más barato ($3–7 CPM) y donde está el crecimiento venezolano. Prueba solo si tienes vídeo bueno del influencer |

**No abras Meta Ads** en esta fase: es la subasta donde compiten MadMuscles y BetterMe, y desde Venezuela es donde más riesgo tienes de que te desactiven la cuenta con saldo dentro.

**Regla de corte:** cualquier grupo de anuncios que gaste $15 sin un registro, se apaga.

---

## 5. Creatividades con ángulo venezolano

Los cinco anuncios genéricos ya están en `06-first-100-users-playbook.md`. Estos cuatro son específicos de este mercado y **no funcionarían en España**:

1. **Coste** — "El gimnasio subió otra vez. Las barras del parque siguen siendo gratis." → app + parque.
2. **Datos** — "No gastes datos instalando nada. Se abre en el navegador y pesa menos que una foto." (ángulo PWA, único de verdad).
3. **Prueba social local** — "Los panas del parque ya están en el reto. ¿Y tú?" → captura del leaderboard con nombres venezolanos.
4. **Sin equipo** — "Cero equipo, cero mensualidad, cero excusas. Tu programa completo en el teléfono."

---

## 6. Métricas de corte (revisar a los 30 días)

| Métrica | Objetivo | Si no se cumple |
|---|---|---|
| Usuarios totales | 60–100 | El canal no es el problema: revisa el registro |
| Finalización del quiz | > 40 % | Acorta el quiz |
| Retorno a 7 días | > 20 % | **Para de captar.** Arregla retención primero |
| Registros por referido | > 25 % del total | Las tarjetas de compartir no están funcionando |
| Coste por registro (pagado) | < $2 | Apaga la campaña |

---

## 7. Resumen en una línea

Los primeros 100 usuarios en calistenia **no se compran, se contagian**: un influencer nano venezolano + un reto que obliga a invitar + WhatsApp, con $0. La publicidad pagada es la semana 4, son $50–100 en Google Search hacia México/Colombia/España, y solo tiene sentido cuando ya sepas que la gente que entra vuelve.

---

## Fuentes

- [MadMuscles Funnel Breakdown — Web2App World](https://web2appworld.com/breakdowns/madmuscles/)
- [Health and Fitness App Marketing — Admiral Media](https://admiral.media/fitness-app-marketing-strategies/)
- [Caliverse Success Story — StartupTalky](https://startuptalky.com/caliverse-success-story/)
- [Facebook Ads en Venezuela tras las sanciones — Artech Digital](https://www.artechdigital.net/en/facebook-ads-in-venezuela-sanctions/)
- [Por qué no se pueden publicar anuncios desde Venezuela — The Plan Company](https://www.theplancompany.es/por-que-no-se-pueden-publicar-anuncios-de-facebook-ads-ni-instagram-ads-desde-venezuela-y-como-solucionarlo/)
- [Ya puedes pagar Meta y Google Ads desde Venezuela (2026)](https://www.newstecnicas.info.ve/2026/02/ya-puedes-pagar-meta-y-google-ads.html)
- [Restricciones por país de Google Ads — Ayuda de Google](https://support.google.com/google-ads/answer/6163740?hl=es-419)
- [Venezuela: estadísticas digitales 2026 — Guayoyo Marketing](https://guayoyomarketing.com/venezuela-estadisticas-digitales-2026/)
- [Instagram en Venezuela 2026 — iLifebelt](https://ilifebelt.com/instagram-en-venezuela-2026-datos-clave-y-crecimiento-digital/2026/01/)
- [Facebook es la red más usada en Venezuela — Diario Versión Final](https://diarioversionfinal.com/tecnologia/facebook-es-la-red-social-mas-usada-en-venezuela-gana-batalla-a-whatsapp-y-tiktok/)
- [Mobile App CPI Benchmarks 2026 — The Social Outline](https://thesocialoutline.com/blog/mobile-app-cpi-benchmarks-2026)
- [TikTok Ads Cost 2026 — Stackmatix](https://www.stackmatix.com/blog/tiktok-ads-cost-2026-pricing-breakdown)
- [Influencer Pricing Benchmarks 2026 — InfluenceFlow](https://influenceflow.io/resources/influencer-pricing-benchmarks-by-platform-the-complete-2026-guide-1/)
- [Top Venezuelan Fitness Influencers — Modash](https://www.modash.io/find-influencers/venezuela/fitness)
