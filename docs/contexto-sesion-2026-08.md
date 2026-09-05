# Contexto de sesión — Agosto/Septiembre 2026 (post-cutover Airtable)

Documento de handoff para continuar en otra sesión de Claude. Cubre todo lo tocado
desde el ~31/07/2026 en el ecosistema Roller Cheaper / SCALA. Actualizado: 05/09.

> ⚠️ Hay DOS sesiones de Claude trabajando en paralelo (dos computadoras) sobre el
> branch `sentinel-ui-source-instance`. **Hacer `git pull` antes de empezar** y, si
> se deploya CHAT-Webapp, buildear DESPUÉS de integrar el remoto — el 05/09 un
> deploy pre-rebase casi pisa en producción los commits de la otra sesión.

## Mapa del ecosistema

| Pieza | Repo local | Deploy | Cómo se deploya |
|---|---|---|---|
| App de vendedores + CRM (esta) | `SCALA APPS/CHAT-Webapp` | `chat-webapp-796p.vercel.app` | `npx vercel --prod --yes` y **SIEMPRE** `npx vercel alias set <deploy-url> chat-webapp-796p.vercel.app` (el alias NO se mueve solo) |
| Presupuestador | `SCALA APPS/roller-cheaper-quotes` | `roller-cheaper-quotes.vercel.app` | `npx vercel --prod --yes` (auto-aliasea) |
| Sentinel backend (bot Clara, webhooks Evolution, followups) | `SCALA SENTINEL/sentinel-backend` | Railway | commit + push a `master` **+ `railway up --detach`** (el push solo NO deploya); verificar con `railway deployment list` |
| Sentinel frontend (panel dueños: pipelines, chat, playground, vendedores) | `SCALA SENTINEL/sentinel-frontend` | `scala-sentinel-frontend` en Vercel | push a la rama → autodeploy |

- **Supabase compartido** por todo: proyecto `iydmoeluzzpgevmdvoap`. Credenciales: leer de `CHAT-Webapp/.env.local` (`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- **Client de Roller**: `client_id = 'rece0aEMD5iowEALZ'` (legacy Airtable id). `deal.id` (uuid) = lead_id del ecosistema; `deals.external_lead_id` guarda los `rec...` viejos.
- Evolution API: `https://evo.scalaops.online`, api keys por instancia en tabla `evolution_instances`. Líneas de Roller: `RC Linea 1`, `RC Linea 2`, `RC Linea Cortinado`. La línea activa de cada lead vive en `deal.metadata.source_instance` (actualizada en cada inbound) — TODO envío saliente debe usarla.
- No se puede correr DDL desde acá (sin SQL RPC ni CLI auth): los ALTER los ejecuta Franco en Supabase Studio.
- **PENDIENTE CRÍTICO de seguridad**: los `.env` de todos los repos tienen claves reales commiteadas (service_role, Evolution, Anthropic, OpenAI). Rotar antes de publicar repos o sumar tenants externos.

## Fixes de esta sesión (todos deployados y verificados)

### Sentinel backend (Railway)
1. **Historial del agente al revés** (`src/agent/core.ts` `getHistory`): cargaba los 30 mensajes MÁS VIEJOS (`order asc + limit`). En charlas >30 mensajes el bot no veía nada reciente → repetía preguntas y fotos (caso "Vivi": 14 veces la misma carta de colores en 25 min; verificado que NO eran followups). Fix: `order desc + limit + reverse`.
2. **Ventana de historial 30 → 80** (`MAX_HISTORY_MESSAGES`): Clara manda 2-4 burbujas por turno; 30 eran ~10 min de conversación.
3. **Media enviada visible para el modelo** (`core.ts` mapeo de historial): los envíos de `send_media` se guardan con content vacío (el placeholder "📎 asset" se imitaba — ver commit a7ae57f); ahora se inyectan al historial del LLM como `[registro de acción: acá enviaste la imagen "X"...]` construido desde `event_metadata`, y el system prompt (`prompt-builder.ts`, sección send_media) aclara que es log interno no imitable. Así "no repitas fotos" es cumplible.
4. **Reintentos al guardar media entrante** (`src/inbound/handler.ts` + `src/lib/storage.ts`): ~15% de las fotos entrantes fallaban al subirse (transcripción sin archivo, pérdida definitiva). Ahora 3 intentos con backoff, upload `upsert:true`, e `insertMessageAttachment` devuelve boolean en vez de tragarse errores.
5. **Playground simula `send_media`** (`send-media.ts` + `routes/agent.ts`): en sandbox (`isSandboxPhone`) saltea Evolution pero persiste mensaje+attachment; `/agent/test` devuelve `media_sent` y `/agent/test/history` incluye attachments. Antes la tool directamente fallaba en el playground.

### CHAT-Webapp (Vercel)
6. **Fotos de clientes invisibles para vendedores**: RLS empezó a bloquear `message_attachments` para el rol del navegador (cambios de seguridad del 7-8/08) → la app veía `[]`. Fix: endpoint server-side `POST /api/message-attachments/batch` (service key, valida sesión+client) y `useMessages.loadAttachments` lo usa. OJO: las reapariciones posteriores del síntoma fueron (a) pestañas viejas sin recargar, (b) el punto 4 de arriba — el fix batch nunca se rompió.
7. **Audio del vendedor reproducible** (`/api/send-audio`): grababa y enviaba pero descartaba el archivo (solo texto "Audio (Ns)"). Ahora sube el audio a `chat-attachments` `{client}/{lead}/outbound/` + crea attachment; el cliente pasa el `mimeType` real del MediaRecorder (MessageInput → ChatContainer → route).
8. **PDF con error desde el chat** (abría desde panel lateral, no desde la burbuja): la URL firmada se generaba al renderizar (TTL 10 min) y el click tardío la encontraba vencida. Fix: `signed-url?redirect=1` (302 con firma fresca al click) y todos los links "Abrir archivo/audio/video" + `<a>` de imágenes en `MessageBubble` lo usan. También sirve `public_url` (assets del bot) directo.
9. **Detector de versión nueva** (`/api/version` + `components/NewVersionBanner.tsx` en layout): banner "Hay una versión nueva — Recargar" (chequea cada 5 min y al volver a la pestaña). El sello es `NEXT_PUBLIC_BUILD_ID = process.env.VERCEL_URL` en `next.config.js` — **NO usar Date.now()**: Vercel evalúa la config una vez por compilación (cliente/servidor) y generaba sellos distintos en el mismo deploy → banner en loop (bug ya vivido y arreglado).

### sentinel-frontend (panel)
10. **Vista de chats mostraba 200 de 4.860 leads** (`lib/chat/leads-query.ts`): limit 200 sin orden → subconjunto arbitrario, "leads que no aparecen". Fix: paginación de a 1000 con orden estable.
11. **Vendedores fantasma / pesos**: el upsert de `/api/chat/sellers` resucitaba perfiles (`active:true` fijo) y `Math.floor` rompía pesos decimales — corregidos; además los perfiles owner/admin se ocultan de la lista de vendedores (el perfil "rollercheaper" del dueño invitaba a reactivarlo; se comió ~285 leads del 16-31/07, redistribuidos a Ludmila/Juan). Triple traba en perfiles no-vendedores: `active:false, assignment_weight:0, max_active_leads:0` (el peso 0 solo ya excluye del algoritmo).
12. **Playground renderiza media** (`components/playground/playground-view.tsx`): imágenes/videos que manda el bot aparecen en las burbujas (con `media_sent` del turno y attachments del history).

### roller-cheaper-quotes (presupuestador)
13. **Emoji en nombre de cliente rompía el envío** ("🤎Milagros"): Supabase Storage rechaza keys no-ASCII (`InvalidKey`) → "No se pudo preparar el PDF". Fix: sanitizado de emojis/no-ASCII en `quotePdfFileName` (`src/lib/pdf/fileName.ts`) y `storageSafeFileName` (route de send).
14. **Presupuestos enviados sin registro en el chat**: solo se registraba si el presupuestador se abría desde el botón del chat (viajaba `leadId`). Reenvíos desde la lista o carga manual salían por WhatsApp sin rastro. Fix: `findDealByPhone` en `src/lib/airtable.ts` — sin leadId, resuelve el deal por teléfono (match exacto o único por últimos 10 dígitos) y registra igual. Casos legítimos sin registro: clientes sin contacto en Sentinel (fuera del funnel de WhatsApp) y borradores nunca enviados.
15. **Agregar telas desde settings** (`/settings/pricing`): Bandas, Zebra y Cortinado tienen bloque "Agregar tela" (nombre+precio, clave normalizada); los selectores del formulario leen las claves de la config, así que cotiza sola. **Roller queda excluido a propósito**: sus 19 configuraciones/combos están hardcodeados (`src/lib/catalog/productCatalog.ts`) y atados a los links del bot — telas roller = cambio de código.
16. **Dato importante de precios**: desde el esquema v2 (abril) NADIE guardó la config → el cotizador corre con los defaults hardcodeados de la planilla "COTIZADOR OFI ABRIL 2026". La config guardada vieja (v1, junio) se ignora correctamente. Pedirle al cliente que revise `/settings/pricing` y guarde una vez.

### Datos / operaciones puntuales
17. **Juan Manuel sin `tenant_members`**: era el único vendedor sin membresía (alta anterior al fix del flujo de invitación) → "Unauthorized" al cambiar etapa desde el panel. Insertada fila `role:'seller'` (user_id `179a06bc-...`). El flujo de invitación actual ya crea la membresía.
18. **Análisis de reglas KB de Roller** (26 docs activos en `kb_documents`): contradicciones detectadas y reportadas — 3 reglas de "ventana en L" incompatibles entre sí, reglas de followup 2º ("no menciones cuotas") vs 3º ("recordá cuotas") imposibles de cumplir juntas, Córdoba duplicada, reglas para `propuesta_enviada` donde `bot_can_reply=false` (código muerto). **Pendiente**: consolidar 26→~10 reglas (el usuario quería esperar a ver el efecto del fix de historial). Nota: las reglas aplican al mensaje siguiente de guardarse — el bot que dijo "aplica el mes que viene" confabuló; nunca validar config preguntándole al bot.

### Sesión 05/09 (esta máquina)
19. **CRM: tiempo de respuesta Sentinel vs humano por separado** (`app/crm/page.tsx`, `responseStats`): antes la card "Tiempo respuesta" promediaba bot y vendedor juntos (los segundos del bot escondían las horas del humano). Ahora la primera respuesta se atribuye a quien contestó: card "Respuesta Sentinel" (`averageBotResponseMs`, solo role assistant) y "Respuesta humana" (semántica original: vendedor desde el último mensaje del cliente, tope 4h), cada una con cantidad de respuestas medidas y tendencia propia (`botResponseTrend`). Panel de salud consistente.
20. **Formato de tiempos con segundos** (`formatMinutes` en `app/crm/page.tsx`): <1 min → "42 seg"; <10 min → "1m 35s"; después minutos/horas como antes. Casos borde verificados (59,7s → "1 min").

### Trabajo de la OTRA sesión integrado el 05/09 (commits 56e7c27..78a7c0b)
No lo hice yo — vino del remoto y está deployado junto con lo de arriba:
- Responder a un mensaje específico (cita nativa de WhatsApp; `event_metadata.reply_to_*`).
- Tarjeta de seguimientos muestra el mensaje real enviado.
- Previews de último mensaje vía RPC (sin ventana de 1000) + RPC en tandas de 500.
- Envíos diagnosticables: `lib/send-error.ts`, `lib/send-failure.ts`, `authorizeLead` (las rutas de envío ya no confían en leadPhone/clientId del body), flag `failed` en mensajes optimistas, middleware anti-loop de redirects.

## Técnicas útiles (probadas en esta sesión)

- **Sesión de vendedor para probar endpoints en prod** (sin password): `POST /auth/v1/admin/generate_link` (service key, type magiclink) → `POST /auth/v1/verify` (anon key, token_hash) → cookie `sb-iydmoeluzzpgevmdvoap-auth-token = 'base64-' + base64url(JSON de la sesión)`.
- Leer env: `KEY=$(grep SUPabase... CHAT-Webapp/.env.local | cut -d= -f2)`. PostgREST: cuidado con el cap de 1000 filas (paginar con `.range()`) y `in.()` gigantes.
- Railway logs: `railway logs` (tail corto); eventos clave: `attachment_save_error`, `insert_attachment_error`, `tool_send_media`, `agent_test_error`.

## Pendientes / próximos pasos

1. **Verificar orgánicamente** (26/08+): primer audio de vendedor con reproductor y fotos entrantes con attachment post-deploy de reintentos.
2. **Consolidación de reglas KB** de Roller (punto 18) — esperar 1-2 días del fix de historial y proponer el set limpio a Cris.
3. **Rotar claves commiteadas** (crítico antes de multi-tenant).
4. **Decisión estratégica tomada en conversación**: el CRM va a integrarse al panel de Sentinel (no producto aparte) como parte de la visión agencia (ads Meta → Sentinel atiende → CRM → agente reportero). Plan por fases discutido: portar CRM al panel → agente reportero con tools de lectura → atribución Meta/UTM → agente de ads. Solo falta el "go" para armar el plan detallado de fase 1.
5. Deferred viejos: línea de reclamos, ManyChat/Instagram, 96 leads muteados del 14/07, cancelación final de Airtable.
