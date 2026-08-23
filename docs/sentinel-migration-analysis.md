# Análisis de migración: CHAT-Webapp → SCALA Revenue OS (Sentinel)

Fecha de análisis: 2026-07-03
Rama analizada: `sentinel-ui-source-instance`
Destino: `SCALA APPS/SCALA-Revenue-OS` (Fase 3 del roadmap: "Conversations")

## 1. Contexto

CHAT-Webapp es la consola de conversación de WhatsApp para vendedores de Roller Cheaper
(login de vendedor → bandeja de leads de Airtable → chat con historial en Supabase →
envío por Evolution API → inbound vía n8n). Fue el preludio de Sentinel y hoy está en
producción en Vercel (`chat-webapp-796p.vercel.app`).

SCALA Revenue OS es la plataforma multi-tenant destino. Ya existe como app Next.js
separada, usa **el mismo proyecto Supabase** (`iydmoeluzzpgevmdvoap`) y hoy es
solo-lectura sobre las tablas de Sentinel. Su roadmap (docs/integration-roadmap.md)
prevé la unificación del chat como Fase 3.

La documentación técnica detallada del chat está en
`docs/chat-webapp-technical-documentation.md` (2026-05-16). Este documento cubre lo
que cambió desde entonces y los gaps de migración.

## 2. Qué se agregó al chat después de la doc de mayo

| Feature | Archivos clave | Dependencias nuevas |
|---|---|---|
| Registro de ventas con comprobantes múltiples | `app/api/sales/route.ts`, `app/api/sales/options/route.ts`, `components/chat/SaleModal.tsx` | Airtable `AIRTABLE_SALES_TABLE_ID` (tblS74HxfH5MHAga3), `AIRTABLE_SELLERS_TABLE_ID` (tblEcyyvFdnQYlTl6); storage `chat-attachments` |
| Etapas dinámicas desde Airtable | `app/api/stages/route.ts`, `lib/airtable.ts` (`getPipelineStages`, `updateLeadStage`) | `AIRTABLE_STAGES_TABLE_ID` (tblFMvB5bjBmq5Hl8) |
| Reglas de etapas (normalización, propuesta, terminal) | `lib/stage-rules.ts` | — |
| Cancelación de followups (manual y automática al cerrar lead) | `lib/followup-queue.ts`, `app/api/followups/cancel/route.ts`, `app/api/update-lead-stage/route.ts` | tabla `followup_queue` |
| Event pills de Sentinel con actor/hora/motivo | `ChatContainer.tsx` (`SentinelEvent`: category, actor, reason) | mensajes `role='system'` con JSON |
| Estado de presupuesto en panel del lead | `LeadPanel.tsx` (`QuoteStatusCard`), `MessageBubble.tsx` | detección de attachment `document` |
| Preferencias de sonido de notificación | `ChatList.tsx` | `localStorage['scala_notification_settings']` |
| Prioridad "necesita respuesta" en bandeja | `ChatList.tsx` (`requiresHumanReply`) | — |
| Instancia WhatsApp activa por lead | `lib/airtable.ts` (`source_instance`), pause/resume-bot | campo Airtable `source_instance` |
| Scroll manual respetado en el hilo | `ChatContainer.tsx` | — |
| Vendedor activo desde Airtable | `app/api/sales/options` (`Activo`/`Estado`) | — |

`lib/shortcuts/` está vacío (directorio residual, ignorar).

## 3. Estado del destino (Revenue OS)

- **Hecho:** signup/login de clientes (tenant), modelo `tenants` + `tenant_members`
  (roles owner/admin/manager/viewer), creación y listado de vendedores
  (`/conversations`), dashboard de lectura de Sentinel (`lib/sentinel/queries.ts`),
  migración `001_revenue_os_core.sql` (7 tablas + RLS de solo lectura vía
  `tenant_members`).
- **Placeholder:** todo el resto del nav (Fugas, Contactos, Cotizaciones, Scraping,
  Configuración). No hay UI de chat, no hay browser client de Supabase en uso, no hay
  Realtime.
- **Regla de tenancy obligatoria:** `client_id` se resuelve SIEMPRE desde
  `tenant_members` del usuario autenticado; prohibido aceptarlo por URL, query string,
  body o localStorage (docs/multi-tenancy.md).

## 4. Gaps para la migración

### 4.1 Modelo de identidad (el gap más grande)
- Hoy el vendedor loguea directo y su `client_id` sale de `seller_profiles`.
  Revenue OS resuelve `client_id` desde `tenant_members` y declara explícitamente que
  `seller_profiles` NO es el boundary de auth.
- Decisión necesaria: o los vendedores obtienen fila en `tenant_members` (¿nuevo rol
  `seller`?), o `getTenantAccess()` se extiende para resolver también por
  `seller_profiles`. Además hace falta gating por rol: un vendedor solo ve su bandeja;
  un owner/admin ve todo el módulo.
- La ruta `/conversation` del chat recibe `client_id`, `lead_id`, `instance`, etc. por
  query string (deep-links desde Airtable). Eso viola la regla de tenancy del destino:
  hay que rediseñarla para que el tenant salga de la sesión y solo el `lead_id` venga
  en la URL.

### 4.2 Duplicación de `seller_profiles`
- `001_revenue_os_core.sql` hace `CREATE TABLE seller_profiles`, pero esa tabla YA
  existe en el proyecto Supabase compartido (la usa el chat). Hay que reconciliar el
  schema (email, phone, active son columnas nuevas) con una migración aditiva, no
  creación. Además `createSeller()` de Revenue OS aún no persiste email/phone y
  `getSellersForCurrentTenant()` no los selecciona.

### 4.3 Capacidad de escritura y APIs a portar
Revenue OS es solo-lectura. Hay que portar ~15 API routes del chat (send-message,
send-audio, send-file + upload-url, messages [PATCH/DELETE], messages/latest,
inbound-media, airtable-webhook, pause-bot, resume-bot, update-lead-stage, stages,
sales + options, followups/cancel, message-attachments signed-url, leads) junto con
sus libs (`lib/airtable.ts`, `lib/evolution.ts`, `lib/insert-message.ts`,
`lib/whatsapp-message-key.ts`, `lib/stage-rules.ts`, `lib/followup-queue.ts`),
re-autorizando cada una con `getTenantAccess()` en lugar de `seller_profiles`.

### 4.4 Variables de entorno faltantes en Revenue OS
```
AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_LEADS_TABLE_ID,
AIRTABLE_SALES_TABLE_ID, AIRTABLE_SELLERS_TABLE_ID, AIRTABLE_STAGES_TABLE_ID,
AIRTABLE_WEBHOOK_SECRET, N8N_MEDIA_WEBHOOK_SECRET,
EVOLUTION_API_URL, EVOLUTION_API_KEY,
NEXT_PUBLIC_QUOTE_APP_URL
```
(Supabase ya está configurado; es el mismo proyecto.)

### 4.5 RLS y Realtime
- Las policies actuales de lectura del chat (p. ej. `message_attachments`) validan por
  `seller_profiles.client_id`. Para que usuarios de tenant lean el chat hacen falta
  policies equivalentes vía `tenant_members` sobre `messages`,
  `message_attachments`, `followup_queue` y `lead_notifications`.
- Revenue OS no usa aún el browser client (`lib/supabase/client.ts` sin uso). El chat
  depende de Supabase Realtime + polling (canales `messages-{leadId}`,
  `followups-{leadId}`, `lead-notifications`, `new-messages`). Hay que habilitar ese
  stack en el destino.

### 4.6 Integraciones externas apuntando a la URL vieja
Los sistemas externos llaman por URL al deploy actual y hay que re-apuntarlos (o dejar
redirects/proxy durante la transición):
- n8n → `POST /api/inbound-media` (header `x-webhook-secret`).
- Automatización de Airtable → `POST /api/airtable-webhook`.
- Deep-links "abrir conversación" en Airtable → `/conversation?...`.
- El presupuestador (`roller-cheaper-quotes`) es saliente (se abre por URL), no
  requiere cambios, solo la env var.

### 4.7 UI y estilos
- Tailwind: chat usa v4 (`@tailwindcss/postcss`), Revenue OS usa v3 con tokens
  `scala-*` y branding navy propio. Gran parte del chat usa estilos inline, así que el
  costo real es re-skinear los componentes al design system del destino.
- Componentes a portar: `ChatList`, `ChatContainer`, `MessageBubble`, `MessageInput`,
  `ChatHeader`, `LeadPanel`, `BotPauseControl`, `SaleModal` + hooks `useMessages`,
  `useSendMessage`, `useFollowups`.
- localStorage keys a conservar o migrar: `scala_seen_leads`,
  `scala_notification_settings`.

### 4.8 Operación
- Middleware/protección de rutas del módulo chat en Revenue OS (hoy solo hay checks
  por página).
- Cookies de sesión distintas (`scala-revenue-os-auth`): los vendedores deberán volver
  a loguear.
- Ninguno de los dos repos tiene tests; conviene un smoke test manual guiado (login
  vendedor, abrir lead, enviar texto/audio/archivo, recibir media, pausar bot,
  registrar venta) antes y después del switch.

## 5. Orden de migración sugerido

1. **Identidad:** definir cómo entra el vendedor a Revenue OS (rol en
   `tenant_members` vs. resolución dual) y reconciliar `seller_profiles`.
2. **Schema/RLS:** migración aditiva de `seller_profiles` + policies de lectura de
   chat para `tenant_members`.
3. **Port de libs y API routes** con la nueva autorización, mismas tablas de datos
   (no hay migración de datos: Supabase y Airtable son compartidos).
4. **Port de UI** bajo `/conversations` (bandeja + hilo), re-skineada a Tailwind v3 y
   al AppShell del destino, con Realtime + polling.
5. **Switch de integraciones:** re-apuntar n8n, webhook de Airtable y deep-links al
   nuevo dominio, con período de doble disponibilidad.
6. **Retiro:** dejar CHAT-Webapp en modo legado/redirect y congelar deploys.
