# SCALA Sentinel Chat Webapp - Documentacion tecnica detallada

Ultima revision: 2026-05-16

Repositorio local: `CHAT-Webapp`

Rama de trabajo actual: `sentinel-ui-source-instance`

Proyecto Vercel asociado localmente: `chat-webapp-796p`

Dominio de cliente usado en produccion: `https://chat-webapp-796p.vercel.app`

## 1. Proposito funcional

SCALA Sentinel Chat Webapp es la consola de conversacion para vendedores que atienden leads de WhatsApp. La aplicacion permite:

- Autenticar vendedores con Supabase Auth.
- Mostrar la bandeja de leads asignados al vendedor desde Airtable.
- Abrir una conversacion por lead.
- Leer mensajes guardados en Supabase.
- Recibir nuevos mensajes en tiempo casi real via Supabase Realtime mas polling.
- Enviar mensajes de texto por WhatsApp usando Evolution API.
- Enviar audios grabados desde el navegador por WhatsApp usando Evolution API.
- Enviar fotos, videos o PDF por WhatsApp usando Supabase Storage como staging.
- Mostrar y reproducir adjuntos entrantes y salientes: audio, imagen, video y documento.
- Editar mensajes enviados por vendedor en WhatsApp, cuando existe la key de WhatsApp.
- Editar mensajes del Sentinel en la base local de Supabase.
- Eliminar mensajes enviados por vendedor en WhatsApp para todos, cuando existe la key de WhatsApp.
- Pausar y reanudar el bot Sentinel por lead, escribiendo campos en Airtable.
- Abrir el presupuestador externo de Roller Cheaper con parametros del lead.
- Mostrar informacion comercial extraida del lead desde Airtable.
- Mostrar follow-ups desde Supabase.
- Notificar nuevos mensajes con toast y sonido cuando llegan a leads no abiertos.

## 2. Stack tecnico

### Runtime y framework

- Next.js `14.2.35`
- React `18.3.1`
- TypeScript
- App Router de Next.js
- Server Components para paginas principales
- Client Components para UI interactiva

### Backend dentro de Next

La app usa API Routes del App Router bajo `app/api/**/route.ts`.

### Servicios externos

- Supabase Auth: autenticacion de vendedores.
- Supabase Postgres: persistencia de mensajes, perfiles, follow-ups, notificaciones y configuracion de instancias.
- Supabase Realtime: eventos INSERT/UPDATE/DELETE para mensajes, adjuntos, follow-ups y notificaciones.
- Supabase Storage: bucket privado `chat-attachments` para media de chat.
- Airtable: fuente maestra de leads, pipeline, vendedor asignado y datos extraidos.
- Evolution API: transporte para enviar, editar y borrar mensajes en WhatsApp.
- n8n: orquestador inbound que recibe webhooks de Evolution API y alimenta Airtable/Supabase.
- Vercel: hosting del frontend/backend Next.js.

## 3. Scripts npm

Archivo: `package.json`

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint"
}
```

Comando principal de validacion antes de deploy:

```bash
npm run build
```

No hay suite de tests automatizados declarada en este repo.

## 4. Variables de entorno

Las variables detectadas por uso en codigo son:

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

AIRTABLE_API_KEY
AIRTABLE_BASE_ID
AIRTABLE_LEADS_TABLE_ID
AIRTABLE_WEBHOOK_SECRET

N8N_MEDIA_WEBHOOK_SECRET

EVOLUTION_API_URL
EVOLUTION_API_KEY

NEXT_PUBLIC_QUOTE_APP_URL
```

### 4.1 Supabase

`NEXT_PUBLIC_SUPABASE_URL`

- URL publica del proyecto Supabase.
- Se usa en browser, middleware y server routes.

`NEXT_PUBLIC_SUPABASE_ANON_KEY`

- Key anon para clientes browser/server con RLS.
- Se usa para Auth, Server Client y Browser Client.

`SUPABASE_SERVICE_ROLE_KEY`

- Key privilegiada server-side.
- Se usa para:
  - insertar mensajes enviados,
  - leer ultimos mensajes de leads,
  - generar signed URLs,
  - crear/actualizar bucket,
  - subir media entrante,
  - consultar/actualizar tablas con bypass de RLS cuando corresponde.

Nunca debe exponerse al navegador.

### 4.2 Airtable

`AIRTABLE_API_KEY`

- Token Bearer para API REST de Airtable.

`AIRTABLE_BASE_ID`

- Base por defecto de Airtable.

`AIRTABLE_LEADS_TABLE_ID`

- Tabla por defecto de leads.

`AIRTABLE_WEBHOOK_SECRET`

- Header secreto esperado por `/api/airtable-webhook`.
- Tambien puede ser fallback para `/api/inbound-media` si `N8N_MEDIA_WEBHOOK_SECRET` no existe.

### 4.3 n8n inbound media

`N8N_MEDIA_WEBHOOK_SECRET`

- Se valida contra header `x-webhook-secret` en `/api/inbound-media`.
- Si esta definido, tiene prioridad sobre `AIRTABLE_WEBHOOK_SECRET`.

### 4.4 Evolution API

`EVOLUTION_API_URL`

- Fallback global para URL base de Evolution API si no se encuentra instancia configurada en Supabase.

`EVOLUTION_API_KEY`

- Fallback global para API key de Evolution API.

La forma preferida hoy es resolver instancia desde tabla `evolution_instances`.

### 4.5 Presupuestador

`NEXT_PUBLIC_QUOTE_APP_URL`

- URL base del presupuestador.
- Fallback hardcodeado en codigo:

```txt
https://roller-cheaper-quotes.vercel.app/quotes/new
```

## 5. Arquitectura de alto nivel

```txt
Vendedor
  |
  | navegador
  v
Next.js App Router
  |
  |-- Supabase Auth: login / session
  |-- Supabase Postgres:
  |     seller_profiles
  |     messages
  |     message_attachments
  |     followup_queue
  |     lead_notifications
  |     evolution_instances
  |     n8n_chat_histories
  |
  |-- Supabase Realtime:
  |     INSERT messages
  |     INSERT message_attachments
  |     changes followup_queue
  |     INSERT lead_notifications
  |
  |-- Supabase Storage:
  |     bucket chat-attachments
  |
  |-- Airtable:
  |     leads, pipeline, vendedor, datos extraidos, pausa bot
  |
  |-- Evolution API:
  |     sendText
  |     sendWhatsAppAudio
  |     sendMedia
  |     updateMessage
  |     deleteMessageForEveryone
  |
  |-- n8n:
        inbound handler Evolution API -> Airtable/Supabase
```

## 6. Layout de rutas

### 6.1 `/`

Archivo: `app/page.tsx`

Comportamiento:

1. Crea cliente Supabase server-side.
2. Lee sesion con `supabase.auth.getSession()`.
3. Si hay sesion: redirige a `/chats`.
4. Si no hay sesion: redirige a `/login`.

### 6.2 `/login`

Archivo: `app/login/page.tsx`

Renderiza `LoginForm` envuelto en `Suspense`.

Componente principal: `components/auth/LoginForm.tsx`

Flujo:

1. Usuario ingresa email/password.
2. Se ejecuta:

```ts
supabase.auth.signInWithPassword({ email, password })
```

3. Si falla, se muestra "Email o contrasena incorrectos".
4. Si funciona:
   - toma `next` desde query string,
   - por defecto navega a `/chats`,
   - ejecuta `router.refresh()`.

### 6.3 `/chats`

Archivo: `app/chats/page.tsx`

Es la consola principal.

Flujo server-side:

1. Crea cliente Supabase server-side.
2. Lee sesion.
3. Si no hay sesion, redirige a `/login`.
4. Busca perfil vendedor en tabla `seller_profiles`:

```ts
.from('seller_profiles')
.select('*')
.eq('user_id', session.user.id)
.single()
```

5. Si no existe perfil, redirige a `/login`.
6. Lee parametros opcionales para cambiar fuente Airtable:

```txt
airtable_base_id
airtable_table_id
base_id
table_id
```

7. Si `profile.airtable_seller_name` existe, llama:

```ts
getLeadsBySellerName(profile.airtable_seller_name, airtableSource)
```

8. Busca ultimos mensajes de Supabase para esos leads:

```ts
from('messages')
  .select('lead_id, role, content, created_at')
  .in('lead_id', leadIds)
  .order('created_at', { ascending: false })
  .limit(leadIds.length * 10)
```

9. Construye `lastMessages` con el primer mensaje encontrado por lead.
10. Renderiza `ChatList`.

### 6.4 `/conversation`

Archivo: `app/conversation/page.tsx`

Ruta para abrir un chat directo desde Airtable o link externo.

Parametros soportados:

```txt
lead_phone
lead_id
instance
client_id
lead_name
lead_stage
lead_score
lead_fields
vendedor
seller
sellerName
producto
product
medidas
measurements
bot_resume_at
bot_paused_at
bot_paused_by
```

Si `lead_id` existe, intenta cargar el lead desde Airtable con `getLeadById(lead_id)`.

Prioridad de datos:

1. Airtable.
2. Query string.

Campos minimos para abrir chat:

```txt
leadPhone
leadId
instance
clientId
```

Si falta alguno, renderiza pantalla de error "Lead no encontrado".

Si estan todos, renderiza:

```tsx
<ChatContainer
  leadPhone={leadPhone}
  leadId={leadId}
  clientId={clientId}
  instance={instance}
  leadInfo={leadInfo}
  showBack
/>
```

## 7. Middleware de autenticacion

Archivo: `middleware.ts`

Matcher:

```ts
matcher: ['/((?!_next/static|_next/image|favicon.ico|logo|public).*)']
```

Reglas:

- Si path empieza con `/chats` o `/conversation` y no hay sesion:
  - redirige a `/login?next=<path+query>`.
- Si path es `/login` y hay sesion:
  - redirige a `/chats`.
- Mantiene cookies de Supabase SSR.

## 8. Modelo de datos TypeScript

Archivo: `lib/types.ts`

### 8.1 Message

```ts
interface Message {
  id: string | number;
  lead_id: string;
  client_id: string;
  role: 'user' | 'assistant' | 'human_agent' | 'system';
  content: string;
  was_audio: boolean;
  created_at: string;
  whatsapp_message_id?: string | null;
  whatsapp_remote_jid?: string | null;
  whatsapp_from_me?: boolean | null;
  whatsapp_message_key?: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
    participant?: string;
  } | null;
  attachments?: MessageAttachment[];
}
```

Roles:

- `user`: lead/cliente.
- `assistant`: Sentinel/bot.
- `human_agent`: vendedor humano.
- `system`: evento del sistema.

### 8.2 MessageAttachment

```ts
type MessageAttachmentMediaType = 'audio' | 'image' | 'video' | 'document';

interface MessageAttachment {
  id: string;
  message_id: string;
  lead_id: string;
  client_id: string;
  storage_bucket: string;
  storage_path: string;
  media_type: MessageAttachmentMediaType;
  mime_type: string;
  file_name: string;
  caption?: string | null;
  duration_seconds?: number | null;
  created_at?: string;
}
```

### 8.3 AirtableLead

Representa un lead mapeado desde Airtable.

Campos clave:

```txt
RecordID
phone
whatsapp_display_name
name
client
client_record_id
CHAT
bot_status_display
bot_can_reply
bot_can_followup
bot_paused_by
bot_paused_at
bot_resume_at
source_instance
vendedor_asignado
current_stage
previous_stage
score
qualification_reason
qualified_at
stage_changed_at
dolor_principal
tipo_producto
medidas_info
zona_instalacion
urgencia_compra
last_message_at
last_message_summary
last_message_from
total_messages
next_followup_at
followup_count
proposal_sent_at
proposal_amount
won_amount
lost_reason
source
tags
notes
created_at
```

### 8.4 LeadInfo

Vista compacta para header/panel de chat.

```ts
interface LeadInfo {
  name?: string;
  stage?: string;
  score?: string;
  phone?: string;
  sourceInstance?: string;
  sellerName?: string;
  productType?: string;
  measurementsInfo?: string;
  botPausedAt?: string;
  botResumeAt?: string;
  botPausedBy?: string;
  fields?: LeadField[];
}
```

## 9. Tablas Supabase esperadas

El repo no contiene un schema completo para todas las tablas, pero el codigo usa las siguientes.

### 9.1 `seller_profiles`

Uso:

- Vincula usuario Supabase Auth con vendedor, cliente y nombre de Airtable.

Campos usados:

```txt
id
user_id
client_id
name
airtable_seller_name
created_at
```

Consultas:

```ts
eq('user_id', session.user.id).single()
```

### 9.2 `messages`

Uso:

- Historial normalizado de chat visible en SCALA.

Campos usados:

```txt
id
lead_id
client_id
role
content
was_audio
created_at
whatsapp_message_id
whatsapp_remote_jid
whatsapp_from_me
whatsapp_message_key
```

Migracion parcial incluida:

Archivo: `supabase/messages_whatsapp_keys.sql`

```sql
alter table public.messages
  add column if not exists whatsapp_message_id text,
  add column if not exists whatsapp_remote_jid text,
  add column if not exists whatsapp_from_me boolean,
  add column if not exists whatsapp_message_key jsonb;

create index if not exists messages_whatsapp_message_id_idx
  on public.messages (whatsapp_message_id);
```

Notas:

- Las columnas `whatsapp_*` son necesarias para editar/borrar en WhatsApp.
- La app tiene fallback para insertar mensajes aunque esas columnas no existan todavia.
- Si faltan, se puede enviar, pero no editar/borrar esos mensajes en WhatsApp.

### 9.3 `message_attachments`

Schema incluido:

Archivo: `supabase/message_attachments.sql`

```sql
create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id text not null,
  lead_id text not null,
  client_id text not null,
  storage_bucket text not null default 'chat-attachments',
  storage_path text not null,
  media_type text not null check (media_type in ('audio', 'image', 'video', 'document')),
  mime_type text not null,
  file_name text not null,
  caption text,
  duration_seconds integer,
  created_at timestamptz not null default now()
);
```

Indices:

```sql
message_attachments_message_id_idx on message_id
message_attachments_lead_client_idx on (lead_id, client_id)
```

RLS:

- Habilitada.
- Policy de lectura por vendedor autenticado cuyo `seller_profiles.client_id` coincide con `message_attachments.client_id`.

### 9.4 `followup_queue`

Uso:

- Se lee en `useFollowups`.
- Se escucha por Supabase Realtime.

Campos esperados por UI:

```txt
id
lead_id
client_id
stage_name
attempt_number
scheduled_at
status
trigger_type
tone
intent
instructions
sent_at
cancel_reason
error_message
created_at
```

Estados reconocidos visualmente:

```txt
pending
sent
cancelled
failed
```

### 9.5 `lead_notifications`

Uso:

- `app/api/airtable-webhook/route.ts` inserta registros.
- `ChatList` escucha INSERT via Realtime.

Campos usados:

```txt
record_id
client_id
action
```

### 9.6 `evolution_instances`

Uso:

- Resolver URL/API key por instancia y cliente.

Campos usados en `lib/evolution.ts`:

```txt
client_id
instance_name
display_name
base_url
api_key
is_default
```

Regla de seleccion:

1. Se normaliza el nombre pedido eliminando acentos y caracteres no alfanumericos.
2. Se buscan filas donde `instance_name` o `display_name` matchean.
3. Si hay `clientId`, prefiere fila con ese `client_id`.
4. Luego prefiere fila global con `client_id` null.
5. Si no, toma la primera.
6. Si no hay fila valida, usa fallback `EVOLUTION_API_URL` y `EVOLUTION_API_KEY`.

### 9.7 `n8n_chat_histories`

Uso:

- Mantener contexto del agente n8n/Sentinel.
- Al enviar texto/audio/archivo desde vendedor se inserta una fila con:

```ts
{
  session_id: leadPhone,
  message: { type: 'ai', text: '...' }
}
```

Nota importante:

- Aunque el vendedor sea humano, se guarda como `type: 'ai'` para que n8n lo incorpore en el historial esperado por el flujo actual.

## 10. Storage Supabase

Bucket:

```txt
chat-attachments
```

Configuracion esperada:

```txt
public: false
fileSizeLimit: 50 MB
allowedMimeTypes:
  audio/*
  image/*
  video/*
  application/pdf
```

Rutas de archivos salientes:

```txt
{clientId}/{leadId}/{Date.now()}-{safeFileName(fileName)}
```

Rutas de archivos entrantes desde n8n:

```txt
{clientId}/{leadId}/inbound/{Date.now()}-{safeFileName(fileName)}
```

Los adjuntos no se sirven publicamente. Para reproducir/ver un archivo:

1. UI pide `/api/message-attachments/:id/signed-url`.
2. API valida sesion y `client_id`.
3. API genera signed URL de 10 minutos.
4. UI usa esa URL en `audio`, `img`, `video` o link.

## 11. Airtable

Archivo principal: `lib/airtable.ts`

### 11.1 Fuente de datos

Base/table default:

```ts
AIRTABLE_BASE_ID
AIRTABLE_LEADS_TABLE_ID
```

Override por request:

```ts
airtable_base_id | base_id
airtable_table_id | table_id
```

### 11.2 Listado por vendedor

Funcion:

```ts
getLeadsBySellerName(sellerName, source?)
```

Filtro Airtable:

```txt
{Vendedor Asignado}="{sellerName}"
```

Parametros Airtable:

```txt
pageSize=100
cellFormat=string
timeZone=America/Argentina/Buenos_Aires
userLocale=es
```

Paginacion:

- Usa `offset` hasta agotar registros.

Orden inicial:

1. Orden por stage con `STAGE_ORDER`.
2. Si stage empata, por `last_message_at` descendente.

Orden de stages:

```txt
calificado        -> 0
en_calificacion   -> 1
propuesta_enviada -> 2
en_proceso        -> 3
nuevo             -> 4
no_responde       -> 5
cerrado_ganado    -> 6
cerrado_perdido   -> 7
otros             -> 99
```

### 11.3 Lectura por record ID

Funcion:

```ts
getLeadById(recordId, source?)
```

Hace GET a:

```txt
https://api.airtable.com/v0/{baseId}/{tableId}/{recordId}
```

### 11.4 Actualizar campos de lead

Funcion:

```ts
updateLeadFields(recordId, fields)
```

Hace PATCH:

```json
{
  "fields": {
    "...": "..."
  }
}
```

Se usa para:

- pausar bot,
- reanudar bot,
- actualizar stage.

## 12. Evolution API

Archivo principal: `lib/evolution.ts`

### 12.1 Resolucion de instancia

Entrada:

```txt
instance
clientId opcional
```

Salida:

```ts
{
  baseUrl: string;
  apiKey: string;
  instanceName: string;
}
```

Fuente primaria:

- Tabla Supabase `evolution_instances`.

Fallback:

- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`

### 12.2 Normalizacion de telefono

```ts
normalizePhone(value) = value.replace(/\D/g, '')
```

Se envia a Evolution sin simbolos ni espacios.

### 12.3 Enviar texto

Funcion:

```ts
sendWhatsAppMessage(instance, number, text, clientId?)
```

Endpoint Evolution:

```txt
POST {baseUrl}/message/sendText/{instanceName}
```

Headers:

```txt
Content-Type: application/json
apikey: {apiKey}
```

Body:

```json
{
  "number": "549...",
  "text": "mensaje"
}
```

### 12.4 Enviar audio

Funcion:

```ts
sendWhatsAppAudio(instance, number, audioBase64, clientId?)
```

Endpoint:

```txt
POST {baseUrl}/message/sendWhatsAppAudio/{instanceName}
```

Body:

```json
{
  "number": "549...",
  "audio": "<base64>",
  "encoding": true
}
```

### 12.5 Enviar media

Funcion:

```ts
sendWhatsAppMedia(instance, number, input, clientId?)
```

Endpoint:

```txt
POST {baseUrl}/message/sendMedia/{instanceName}
```

Body:

```json
{
  "number": "549...",
  "mediatype": "image|video|document",
  "mimetype": "image/jpeg",
  "media": "https://signed-url...",
  "fileName": "archivo.jpg",
  "caption": "opcional"
}
```

### 12.6 Editar mensaje en WhatsApp

Funcion:

```ts
updateWhatsAppMessage(instance, number, key, text, clientId?)
```

Endpoint:

```txt
POST {baseUrl}/chat/updateMessage/{instanceName}
```

Body:

```json
{
  "number": "candidate",
  "text": "nuevo texto",
  "key": {
    "remoteJid": "549...@s.whatsapp.net",
    "fromMe": true,
    "id": "...",
    "participant": "opcional"
  }
}
```

La funcion prueba candidatos de `number`:

1. `key.remoteJid`
2. numero derivado de `key.remoteJid`
3. numero normalizado recibido

Si Evolution responde `RemoteJid does not match`, prueba el siguiente candidato.

### 12.7 Borrar mensaje en WhatsApp para todos

Funcion:

```ts
deleteWhatsAppMessageForEveryone(instance, key, clientId?)
```

Endpoint:

```txt
DELETE {baseUrl}/chat/deleteMessageForEveryone/{instanceName}
```

Body:

```json
{
  "id": "...",
  "remoteJid": "549...@s.whatsapp.net",
  "fromMe": true,
  "participant": "opcional"
}
```

## 13. Captura y persistencia de WhatsApp keys

Archivos:

- `lib/whatsapp-message-key.ts`
- `lib/insert-message.ts`

Cuando Evolution devuelve:

```json
{
  "key": {
    "remoteJid": "...",
    "fromMe": true,
    "id": "..."
  }
}
```

Se transforma en:

```ts
{
  whatsapp_message_id: key.id,
  whatsapp_remote_jid: key.remoteJid,
  whatsapp_from_me: key.fromMe,
  whatsapp_message_key: key
}
```

Insercion robusta:

```ts
insertMessageWithOptionalWhatsappKey(supabase, payload)
```

Si Supabase devuelve error por columnas faltantes (`PGRST204` o menciona campos `whatsapp_*`), reintenta insertando sin esos campos.

Consecuencia:

- El mensaje queda visible.
- Pero no se podra editar/borrar en WhatsApp porque no hay key persistida.

## 14. Componentes principales

### 14.1 `ChatList`

Archivo: `components/chat/ChatList.tsx`

Responsabilidades:

- Renderizar la consola de 3 columnas:
  - sidebar/filtros,
  - lista de leads,
  - chat abierto.
- Mantener estado de:
  - leads,
  - filtro activo,
  - lead seleccionado,
  - previews de ultimos mensajes,
  - leads vistos/no vistos,
  - toasts de nuevos mensajes,
  - sonido de notificacion.
- Escuchar:
  - `lead_notifications`,
  - `messages`.
- Hacer polling de:
  - leads,
  - previews.
- Seleccionar lead y montar `ChatContainer`.

Estados relevantes:

```ts
const [leads, setLeads]
const [newLeadIds, setNewLeadIds]
const [activeStage, setActiveStage]
const [selectedLead, setSelectedLead]
const [msgPreviews, setMsgPreviews]
const [seenAt, setSeenAt]
const [toasts, setToasts]
const [search, setSearch]
```

Persistencia local browser:

```txt
localStorage['scala_seen_leads']
```

Se usa para saber si el ultimo mensaje de un lead ya fue visto por el vendedor.

Orden visual de leads:

1. Leads marcados como nuevos primero.
2. Luego por ultima actividad descendente.

Ultima actividad:

```ts
preview.created_at || lead.last_message_at || lead.created_at
```

Notificaciones:

- Solo mensajes `role === 'user'`.
- No muestra toast si ese lead ya esta abierto.
- Sonido usa Web Audio API.
- El sonido solo puede sonar si el navegador ya permitio audio por una interaccion previa (`pointerdown` o `keydown`) y el `AudioContext` esta `running`.

### 14.2 `ChatContainer`

Archivo: `components/chat/ChatContainer.tsx`

Responsabilidades:

- Orquestar una conversacion abierta.
- Cargar mensajes con `useMessages`.
- Enviar texto con `useSendMessage`.
- Enviar audio.
- Enviar archivos.
- Editar/borrar mensajes.
- Abrir presupuestador.
- Pausar/reanudar bot.
- Cargar follow-ups con `useFollowups`.
- Renderizar header, action bar, lista de mensajes, errores, composer y panel derecho.

Props:

```ts
interface ChatContainerProps {
  leadPhone: string;
  leadId: string;
  clientId: string;
  instance: string;
  leadInfo?: LeadInfo;
  showBack?: boolean;
}
```

### 14.3 `MessageBubble`

Archivo: `components/chat/MessageBubble.tsx`

Responsabilidades:

- Renderizar burbuja segun rol.
- Mostrar adjuntos.
- Permitir editar/eliminar cuando corresponde.

Reglas:

- `user`: izquierda, label `Lead`.
- `assistant`: derecha, label `Sentinel`.
- `human_agent`: derecha, label `Vos`.
- `system`: centrado como pill.

Edicion:

- Permitida en:
  - `assistant`,
  - `human_agent` con key WhatsApp guardada.

Borrado:

- Permitido solo en `human_agent` con key WhatsApp guardada.

### 14.4 `MessageInput`

Archivo: `components/chat/MessageInput.tsx`

Responsabilidades:

- Texto:
  - Enter envia.
  - Shift+Enter agrega linea.
- Adjuntos:
  - imagen,
  - video,
  - PDF.
- Audio:
  - graba con `MediaRecorder`,
  - prefiere `audio/ogg;codecs=opus`,
  - fallback a `audio/webm;codecs=opus`,
  - fallback a `audio/webm`.

Validaciones archivo:

```txt
mimeType debe ser image/*, video/* o application/pdf
tamanio maximo 50 MB
```

### 14.5 `LeadPanel`

Archivo: `components/chat/LeadPanel.tsx`

Responsabilidades:

- Mostrar datos del lead:
  - nombre,
  - telefono,
  - etapa,
  - score,
  - campos extraidos,
  - follow-ups.
- Separar follow-ups pendientes de historicos.

### 14.6 `BotPauseControl`

Archivo: `components/chat/BotPauseControl.tsx`

Responsabilidades:

- Mostrar estado de pausa.
- Mostrar temporizador restante.
- Ofrecer pausas rapidas:
  - 30 min,
  - 1 hora,
  - 2 horas,
  - 4 horas,
  - manana.
- Permitir fecha/hora especifica.
- Reanudar bot.

## 15. Hooks principales

### 15.1 `useMessages`

Archivo: `hooks/useMessages.ts`

Entrada:

```ts
useMessages(leadId, clientId)
```

Salida:

```ts
{
  messages,
  loading,
  error,
  realtimeStatus,
  addOptimisticMessage,
  replaceOptimisticMessage,
  updateLocalMessage,
  deleteLocalMessage
}
```

Carga inicial:

```ts
from('messages')
  .select('*')
  .eq('lead_id', leadId)
  .eq('client_id', clientId)
  .order('created_at', { ascending: true })
  .order('id', { ascending: true })
```

Luego carga adjuntos de esos mensajes:

```ts
from('message_attachments')
  .select('*')
  .in('message_id', ids)
  .order('created_at', { ascending: true })
```

Realtime:

- Canal `messages-${leadId}`.
- Escucha INSERT en `messages`.
- Escucha INSERT en `message_attachments`.

Polling:

- Cada 3500 ms vuelve a buscar mensajes.
- Motivo: cubrir casos donde Supabase Realtime no entregue algun evento.

Merge:

- Usa Map por `message.id`.
- Preserva mensajes optimistas `temp-*` hasta que el endpoint devuelve el mensaje real.
- Usa fingerprint para evitar re-render si nada cambio.

Orden:

1. `created_at` ascendente.
2. Si empata, `id` numerico ascendente.
3. Si `id` no es numerico, comparacion lexicografica.

Este desempate evita mensajes desordenados cuando varios inserts llegan en el mismo segundo.

### 15.2 `useSendMessage`

Archivo: `hooks/useSendMessage.ts`

Flujo:

1. Valida texto no vacio.
2. Crea mensaje optimista:

```ts
{
  id: `temp-${Date.now()}`,
  role: 'human_agent',
  content: text,
  was_audio: false,
  created_at: new Date().toISOString()
}
```

3. POST `/api/send-message`.
4. Si OK, reemplaza mensaje optimista por mensaje persistido.
5. Si falla, setea `sendError`.

### 15.3 `useFollowups`

Archivo: `hooks/useFollowups.ts`

Carga:

```ts
from('followup_queue')
  .select('*')
  .eq('lead_id', leadId)
  .eq('client_id', clientId)
  .order('scheduled_at', { ascending: true })
```

Realtime:

- Canal `followups-${leadId}`.
- Escucha cambios `*` en `followup_queue`.
- Si cambia algo del lead, vuelve a cargar.

## 16. API Routes

### 16.1 `GET /api/leads`

Archivo: `app/api/leads/route.ts`

Auth:

- Requiere sesion Supabase.

Query params:

```txt
airtable_base_id
airtable_table_id
base_id
table_id
```

Flujo:

1. Lee sesion.
2. Busca `seller_profiles`.
3. Si no hay `airtable_seller_name`, devuelve `{ leads: [], clientId }`.
4. Llama `getLeadsBySellerName`.
5. Devuelve:

```json
{
  "leads": [],
  "clientId": "..."
}
```

### 16.2 `POST /api/messages/latest`

Archivo: `app/api/messages/latest/route.ts`

Auth:

- Requiere sesion.

Body:

```json
{
  "leadIds": ["recA", "recB"]
}
```

Limites:

- Hasta 150 lead IDs.

Consulta:

```ts
from('messages')
  .select('lead_id, role, content, created_at')
  .eq('client_id', profile.client_id)
  .in('lead_id', leadIds)
  .order('created_at', { ascending: false })
  .limit(leadIds.length * 10)
```

Respuesta:

```json
{
  "lastMessages": {
    "recA": {
      "content": "...",
      "role": "user",
      "created_at": "..."
    }
  }
}
```

### 16.3 `POST /api/send-message`

Archivo: `app/api/send-message/route.ts`

Body:

```json
{
  "leadPhone": "549...",
  "leadId": "rec...",
  "clientId": "recClient...",
  "instance": "RC Linea 2",
  "text": "Hola"
}
```

Validacion:

- Todos los campos son requeridos.
- `text.trim()` no puede estar vacio.

Flujo:

1. Envia por Evolution:

```ts
sendWhatsAppMessage(instance, leadPhone, text.trim(), clientId)
```

2. Inserta en `messages`:

```ts
{
  lead_id: leadId,
  client_id: clientId,
  role: 'human_agent',
  content: text.trim(),
  was_audio: false,
  ...whatsappMessageFields(evolutionResponse)
}
```

3. Inserta en `n8n_chat_histories`:

```ts
{
  session_id: leadPhone,
  message: { type: 'ai', text: text.trim() }
}
```

4. Devuelve `{ message }`.

### 16.4 `POST /api/send-audio`

Archivo: `app/api/send-audio/route.ts`

Body:

```json
{
  "leadPhone": "549...",
  "leadId": "rec...",
  "clientId": "recClient...",
  "instance": "RC Linea 2",
  "audioBase64": "...",
  "duration": 12
}
```

Flujo:

1. Envia a Evolution por `sendWhatsAppAudio`.
2. Inserta en `messages` con:

```ts
role: 'human_agent'
content: duration ? `Audio (${duration}s)` : 'Audio'
was_audio: true
```

3. Inserta contexto en `n8n_chat_histories`:

```txt
[Audio enviado por el vendedor]
```

### 16.5 `POST /api/send-file/upload-url`

Archivo: `app/api/send-file/upload-url/route.ts`

Body:

```json
{
  "leadId": "rec...",
  "clientId": "recClient...",
  "fileName": "foto.jpg",
  "mimeType": "image/jpeg"
}
```

Valida:

- `image/*`
- `video/*`
- `application/pdf`
- max bucket configured 50 MB

Flujo:

1. Asegura bucket `chat-attachments`.
2. Genera path:

```txt
{clientId}/{leadId}/{Date.now()}-{safeFileName(fileName)}
```

3. Crea signed upload URL:

```ts
storage.from('chat-attachments').createSignedUploadUrl(path)
```

Respuesta:

```json
{
  "bucket": "chat-attachments",
  "path": "...",
  "token": "...",
  "signedUrl": "..."
}
```

### 16.6 `POST /api/send-file`

Archivo: `app/api/send-file/route.ts`

Body:

```json
{
  "leadPhone": "549...",
  "leadId": "rec...",
  "clientId": "recClient...",
  "instance": "RC Linea 2",
  "caption": "opcional",
  "storagePath": "recClient/recLead/....jpg",
  "fileName": "foto.jpg",
  "mimeType": "image/jpeg"
}
```

Validacion critica:

```ts
storagePath.startsWith(`${clientId}/${leadId}/`)
```

Flujo:

1. Genera signed URL de lectura por 1 hora.
2. Determina `mediaType` para Evolution:
   - `image/*` -> `image`
   - `video/*` -> `video`
   - otros -> `document`
3. Envia media por Evolution.
4. Inserta `messages` con `role = human_agent`.
5. Inserta `message_attachments`.
6. Inserta contexto en `n8n_chat_histories`.
7. Devuelve `{ message }` con attachment si se pudo insertar.

### 16.7 `POST /api/inbound-media`

Archivo: `app/api/inbound-media/route.ts`

Uso:

- Endpoint para n8n cuando llega audio/foto/video/documento del cliente.

Header:

```txt
x-webhook-secret: N8N_MEDIA_WEBHOOK_SECRET o AIRTABLE_WEBHOOK_SECRET
```

Body con base64:

```json
{
  "leadId": "rec...",
  "clientId": "recClient...",
  "role": "user",
  "content": "Audio recibido",
  "mediaBase64": "...",
  "mediaType": "audio",
  "mimeType": "audio/ogg",
  "fileName": "audio.ogg",
  "caption": "",
  "durationSeconds": 10,
  "createdAt": "2026-05-16T10:00:00.000Z"
}
```

Body con URL:

```json
{
  "leadId": "rec...",
  "clientId": "recClient...",
  "role": "user",
  "mediaUrl": "https://...",
  "mediaType": "image",
  "mimeType": "image/jpeg",
  "fileName": "foto.jpg",
  "caption": "Medidas"
}
```

Flujo:

1. Valida secreto.
2. Normaliza `mediaType`.
3. Asegura bucket `chat-attachments`.
4. Obtiene bytes desde `mediaBase64` o `mediaUrl`.
5. Sube a:

```txt
{clientId}/{leadId}/inbound/{Date.now()}-{fileName}
```

6. Inserta mensaje:

```ts
{
  lead_id: leadId,
  client_id: clientId,
  role: payload.role ?? 'user',
  content: payload.content || defaultContent(mediaType, caption),
  was_audio: mediaType === 'audio',
  created_at: payload.createdAt si existe
}
```

7. Inserta attachment.
8. Devuelve mensaje con attachment.

### 16.8 `GET /api/message-attachments/:id/signed-url`

Archivo: `app/api/message-attachments/[id]/signed-url/route.ts`

Auth:

- Requiere sesion.

Validacion:

- Busca `seller_profiles.client_id` del usuario.
- Busca attachment por `id` y ese `client_id`.

TTL:

```txt
600 segundos
```

Respuesta:

```json
{
  "url": "https://signed-url...",
  "expiresIn": 600
}
```

### 16.9 `PATCH /api/messages/:id`

Archivo: `app/api/messages/[id]/route.ts`

Uso:

- Editar mensaje en UI.
- Si es mensaje de vendedor, tambien edita en WhatsApp.
- Si es mensaje de Sentinel, solo edita Supabase.

Auth:

- Requiere sesion.
- Se valida `client_id` del perfil.

Body:

```json
{
  "content": "nuevo texto",
  "leadPhone": "549...",
  "instance": "RC Linea 2"
}
```

Reglas:

- `content.trim()` no puede estar vacio.
- Si `role === human_agent`:
  - necesita key WhatsApp guardada,
  - necesita `leadPhone`,
  - necesita `instance`,
  - llama `updateWhatsAppMessage`.
- Si `role === assistant`:
  - no llama Evolution,
  - solo actualiza `messages.content`.
- Otros roles:
  - rechaza con 409.

### 16.10 `DELETE /api/messages/:id`

Archivo: `app/api/messages/[id]/route.ts`

Uso:

- Eliminar mensaje enviado por vendedor en WhatsApp para todos.

Auth:

- Requiere sesion.
- Valida `client_id` del perfil.

Body:

```json
{
  "instance": "RC Linea 2"
}
```

Reglas:

- Solo `role === human_agent`.
- Requiere key WhatsApp guardada.
- Requiere instancia.
- Llama `deleteWhatsAppMessageForEveryone`.
- Luego borra attachments y mensaje local de Supabase.

### 16.11 `POST /api/pause-bot`

Archivo: `app/api/pause-bot/route.ts`

Auth:

- Requiere sesion.

Body:

```json
{
  "recordId": "rec...",
  "resumeAt": "2026-05-16T15:00:00.000Z"
}
```

Validaciones:

- `recordId` requerido.
- `resumeAt` requerido.
- `resumeAt` debe ser fecha futura.

Actualiza Airtable:

```ts
{
  bot_paused_at: nowISO,
  bot_resume_at: resumeDate.toISOString(),
  bot_paused_by: session.user.email ?? session.user.id
}
```

### 16.12 `POST /api/resume-bot`

Archivo: `app/api/resume-bot/route.ts`

Body:

```json
{
  "recordId": "rec..."
}
```

Actualiza Airtable:

```ts
{
  bot_paused_at: null,
  bot_resume_at: null,
  bot_paused_by: ""
}
```

### 16.13 `POST /api/update-lead-stage`

Archivo: `app/api/update-lead-stage/route.ts`

Body:

```json
{
  "recordId": "rec...",
  "stage": "propuesta_enviada"
}
```

Actualiza Airtable:

```ts
{ current_stage: stage }
```

### 16.14 `POST /api/airtable-webhook`

Archivo: `app/api/airtable-webhook/route.ts`

Header:

```txt
x-webhook-secret: AIRTABLE_WEBHOOK_SECRET
```

Body:

```json
{
  "record_id": "rec...",
  "client_id": "recClient..." ,
  "action": "created"
}
```

Soporta `client_id` como:

- string,
- array,
- string JSON de array.

Inserta en `lead_notifications`:

```ts
{
  record_id,
  client_id,
  action
}
```

`ChatList` escucha esa tabla para refrescar leads.

## 17. Flujos completos

### 17.1 Login y carga de bandeja

```txt
Usuario -> /login
  -> Supabase Auth signInWithPassword
  -> /chats
  -> server lee session
  -> server lee seller_profiles por user_id
  -> server lee Airtable leads por Vendedor Asignado
  -> server lee ultimos messages por lead
  -> render ChatList
```

### 17.2 Abrir conversacion desde lista

```txt
Click lead en ChatList
  -> setSelectedLead(lead)
  -> guarda seenAt si habia ultimo mensaje
  -> monta ChatContainer
  -> ChatContainer llama useMessages
  -> useMessages carga messages + attachments
  -> subscribe Realtime messages/message_attachments
  -> useFollowups carga followup_queue
  -> render MessageBubble por mensaje
```

### 17.3 Enviar texto

```txt
MessageInput
  -> onSend(text)
  -> useSendMessage crea temp message
  -> POST /api/send-message
      -> sendWhatsAppMessage via Evolution
      -> insert messages con role human_agent
      -> insert n8n_chat_histories
      -> return message real
  -> replaceOptimisticMessage(tempId, real)
  -> Realtime tambien puede recibir el INSERT, pero useMessages deduplica por id
```

### 17.4 Enviar audio grabado

```txt
MessageInput startRecording
  -> getUserMedia({ audio: true })
  -> MediaRecorder
  -> stop
  -> Blob
  -> FileReader base64
  -> ChatContainer.handleSendAudio
      -> temp message "Audio (Xs)"
      -> POST /api/send-audio
          -> sendWhatsAppAudio Evolution
          -> insert messages
          -> insert n8n_chat_histories
      -> reemplaza temp por real
```

### 17.5 Enviar archivo

```txt
MessageInput file picker
  -> valida mime/size
  -> ChatContainer.handleSendFile
      -> temp message
      -> POST /api/send-file/upload-url
          -> createSignedUploadUrl
      -> browser sube a Supabase Storage con uploadToSignedUrl
      -> POST /api/send-file
          -> createSignedUrl lectura
          -> sendWhatsAppMedia Evolution
          -> insert messages
          -> insert message_attachments
          -> insert n8n_chat_histories
      -> reemplaza temp por real con attachment
```

### 17.6 Recibir media desde cliente

```txt
Evolution webhook -> n8n inbound handler
  -> n8n detecta tipo de mensaje
  -> obtiene base64 o media URL
  -> POST /api/inbound-media
      -> valida x-webhook-secret
      -> sube archivo a chat-attachments
      -> insert messages role user
      -> insert message_attachments
      -> return message con attachment
  -> UI recibe via Realtime/polling
  -> MessageBubble pide signed-url
  -> render audio/img/video/link
```

### 17.7 Editar mensaje

```txt
Click Editar en MessageBubble
  -> PATCH /api/messages/:id
      -> valida session y client_id
      -> busca message
      -> si role human_agent:
           extrae whatsapp key
           updateWhatsAppMessage Evolution
      -> si role assistant:
           solo update Supabase
      -> update messages.content
  -> updateLocalMessage
```

### 17.8 Borrar mensaje

```txt
Click Eliminar en MessageBubble
  -> confirm browser
  -> DELETE /api/messages/:id
      -> valida session y client_id
      -> busca message
      -> exige role human_agent
      -> exige whatsapp key
      -> deleteWhatsAppMessageForEveryone Evolution
      -> delete message_attachments por message_id/client_id
      -> delete messages por id/client_id
  -> deleteLocalMessage
```

### 17.9 Pausar bot

```txt
BotPauseControl
  -> vendedor elige duracion o fecha
  -> ChatContainer.pauseBot(resumeAt)
  -> POST /api/pause-bot
      -> valida session
      -> valida fecha futura
      -> PATCH Airtable:
           bot_paused_at
           bot_resume_at
           bot_paused_by
  -> UI muestra contador restante
```

### 17.10 Reanudar bot

```txt
BotPauseControl
  -> Reanudar bot
  -> POST /api/resume-bot
      -> valida session
      -> PATCH Airtable:
           bot_paused_at null
           bot_resume_at null
           bot_paused_by ''
  -> UI limpia estado local
```

### 17.11 Abrir presupuestador

Archivo: `components/chat/ChatContainer.tsx`

Funcion principal:

```ts
buildQuoteUrl({ leadPhone, leadId, clientId, instance, leadInfo })
```

URL base:

```txt
NEXT_PUBLIC_QUOTE_APP_URL
```

Parametros enviados:

```txt
nombre
telefono
leadId
clientId
vendedor
instancia
familia
producto
tela
items
ancho
alto
unidadAncho
unidadAlto
cantidad
```

Parsing avanzado:

- Detecta medidas `110x205`, `3.30m x 2.10m`, `270cm ancho x 250cm alto`.
- Detecta multiples items agrupados por labels:
  - `sistema doble:`
  - `solo sunscreen:`
  - `blackout:`
  - `zebra:`
  - `bandas:`
  - `cortinado:`
- Para multiples items envia JSON en query param `items`.

Ejemplo conceptual:

```json
[
  {
    "familia": "roller",
    "producto": "doble_blackout_100_sunscreen_5",
    "ancho": "110",
    "alto": "205",
    "cantidad": "1",
    "unidadAncho": "cm",
    "unidadAlto": "cm"
  }
]
```

## 18. Orden y sincronizacion de mensajes

Punto critico: `hooks/useMessages.ts`.

La app combina tres fuentes:

1. Carga inicial desde Supabase.
2. Polling cada 3.5 segundos.
3. Supabase Realtime INSERT.

Para evitar duplicados:

- Todos los mensajes se indexan por `id`.

Para evitar desorden:

- Se ordena por:
  1. `created_at`,
  2. `id` numerico,
  3. `id` lexicografico.

Motivo:

- WhatsApp puede entregar mensajes en orden correcto.
- n8n/Supabase pueden insertar varios mensajes con timestamps iguales o muy cercanos.
- Sin desempate, el navegador puede renderizar de forma confusa.

Mensajes optimistas:

- IDs `temp-{Date.now()}`.
- Se preservan hasta que el endpoint devuelve el mensaje real.
- Al reemplazar, se reordena la lista.

## 19. Seguridad

### 19.1 Auth

- `/chats` y `/conversation` protegidas por middleware.
- API routes sensibles usan `createSupabaseServerClient` para verificar sesion.

### 19.2 Multi-tenant

La separacion por cliente usa `client_id`.

Ejemplos:

- Mensajes se filtran por `client_id`.
- Adjuntos se filtran por `client_id`.
- Follow-ups se filtran por `client_id`.
- Instancias Evolution pueden resolverse por `client_id`.

### 19.3 Service role

Se usa solo server-side para:

- bypass RLS cuando la app necesita operar backend,
- insertar mensajes,
- generar signed URLs,
- escribir storage,
- leer previews.

### 19.4 Webhook secrets

- `/api/airtable-webhook` exige `AIRTABLE_WEBHOOK_SECRET`.
- `/api/inbound-media` exige `N8N_MEDIA_WEBHOOK_SECRET` o fallback `AIRTABLE_WEBHOOK_SECRET`.

### 19.5 Storage privado

- Bucket `chat-attachments` no es publico.
- La UI nunca usa paths directos.
- Usa signed URLs de corta duracion.

## 20. Realtime y polling

La app usa ambos deliberadamente.

### Realtime

Canales:

```txt
lead-notifications
new-messages
messages-{leadId}
followups-{leadId}
```

Eventos:

- INSERT en `lead_notifications`.
- INSERT en `messages`.
- INSERT en `message_attachments`.
- `*` en `followup_queue`.

### Polling

- Leads: cada 12 segundos.
- Message previews: cada 4.5 segundos.
- Conversacion abierta: cada 3.5 segundos.

Motivo:

- Airtable no siempre empuja updates al instante.
- Supabase Realtime puede perderse si el navegador queda suspendido.
- Polling evita que el vendedor tenga que recargar.

## 21. Manejo de errores

### Envio WhatsApp

Los errores tecnicos de Evolution se transforman en mensaje amigable en `ChatContainer.friendlySendError`.

Ejemplo crudo:

```txt
Evolution API error 401: Unauthorized
```

Mensaje UI:

```txt
No se pudo enviar el mensaje por un error de conexion con WhatsApp. Revisa que la instancia del lead tenga su API key correcta.
```

### Archivos

Errores posibles:

- MIME no permitido.
- Archivo mayor a 50 MB.
- No se pudo generar signed upload URL.
- No se pudo subir a Storage.
- Evolution rechazo media.
- No se pudo registrar attachment.

### Edicion/borrado

Errores esperados:

- Mensaje no encontrado.
- Mensaje sin WhatsApp key.
- Mensaje no es del vendedor.
- Evolution rechaza update/delete.
- Usuario sin perfil.

## 22. n8n inbound media

Documento existente: `docs/n8n-inbound-media.md`.

Contrato principal:

```txt
POST /api/inbound-media
Header: x-webhook-secret
```

El flujo n8n debe:

1. Detectar si el mensaje entrante es audio, imagen, video o documento.
2. Obtener bytes/base64 o una URL descargable.
3. Resolver:
   - `leadId`,
   - `clientId`,
   - `mediaType`,
   - `mimeType`,
   - `fileName`,
   - caption/duracion si aplica.
4. Llamar `/api/inbound-media`.
5. Continuar con transcripcion/vision si corresponde.

Importante:

- Si n8n inserta tambien mensajes en Supabase por otro camino, debe evitar duplicar el mensaje creado por `/api/inbound-media`.
- Para audio, `mimeType` deberia ser real (`audio/ogg`, `audio/webm`, etc.).
- Para video, `mediaType` debe terminar como `video`, porque la tabla tiene check constraint.

## 23. Deployment

Proyecto Vercel local:

```json
{
  "projectName": "chat-webapp-796p"
}
```

Deploy manual usado:

```bash
vercel --prod --yes
```

Validacion previa:

```bash
npm run build
```

Rama operativa actual:

```txt
sentinel-ui-source-instance
```

## 24. Archivos clave por responsabilidad

```txt
app/chats/page.tsx
  Server page principal de bandeja.

app/conversation/page.tsx
  Entrada directa a conversacion por URL/Airtable.

components/chat/ChatList.tsx
  Sidebar, lista de leads, filtros, previews, toasts, notificaciones.

components/chat/ChatContainer.tsx
  Orquestador de conversacion abierta.

components/chat/MessageBubble.tsx
  Render de mensajes y acciones editar/borrar.

components/chat/MessageInput.tsx
  Composer texto/audio/archivos.

components/chat/LeadPanel.tsx
  Panel de informacion y follow-ups.

components/chat/BotPauseControl.tsx
  Pausa/reanudacion del bot.

hooks/useMessages.ts
  Carga, merge, realtime, polling y orden de mensajes.

hooks/useSendMessage.ts
  Envio optimista de texto.

hooks/useFollowups.ts
  Carga realtime de followups.

lib/airtable.ts
  Cliente Airtable y mapping de leads.

lib/evolution.ts
  Cliente Evolution API, resolucion de instancias, send/edit/delete.

lib/supabase.ts
  Cliente browser.

lib/supabase-server.ts
  Clientes server anon/service.

lib/whatsapp-message-key.ts
  Extraccion de key WhatsApp desde Evolution.

lib/insert-message.ts
  Insercion compatible con o sin columnas whatsapp_*.
```

## 25. Checklist para desarrollar cambios sin romper produccion

Antes de tocar codigo:

1. Confirmar rama:

```bash
git branch --show-current
```

2. Confirmar worktree limpio o identificar cambios ajenos:

```bash
git status --short
```

3. Entender si el cambio afecta:
   - UI pura,
   - Supabase schema,
   - Airtable fields,
   - Evolution API,
   - n8n contract.

Antes de deploy:

```bash
npm run build
```

Despues de deploy:

1. Abrir `/login`.
2. Login vendedor.
3. Abrir `/chats`.
4. Seleccionar lead.
5. Verificar mensajes ordenados.
6. Enviar texto a un numero controlado.
7. Si aplica, probar adjunto.
8. Si aplica, probar pausa/reanudar.

## 26. Problemas conocidos y diagnostico rapido

### 26.1 Mensaje no envia, error 401 Evolution

Causa probable:

- API key incorrecta para la instancia del lead.
- La instancia pedida no matchea `evolution_instances`.
- Fallback `EVOLUTION_API_KEY` no corresponde.

Revisar:

```txt
lead.source_instance
evolution_instances.instance_name
evolution_instances.display_name
evolution_instances.client_id
evolution_instances.api_key
```

### 26.2 No se puede editar/borrar mensaje

Causa probable:

- Mensaje viejo sin columnas `whatsapp_*`.
- Migration `messages_whatsapp_keys.sql` no aplicada.
- Evolution no devolvio `key`.
- Mensaje no fue enviado por `human_agent`.

### 26.3 Audio/foto/video no aparece

Revisar:

- n8n llamo `/api/inbound-media`.
- Header `x-webhook-secret`.
- `mediaType` valido.
- `mimeType` valido.
- Existe fila en `messages`.
- Existe fila en `message_attachments`.
- Existe archivo en bucket `chat-attachments`.
- Signed URL endpoint responde 200.

### 26.4 Leads no actualizan solos

Revisar:

- Realtime habilitado para tablas:
  - `lead_notifications`,
  - `messages`,
  - `message_attachments`,
  - `followup_queue`.
- Polling sigue activo.
- `/api/leads` responde 200.
- `seller_profiles.airtable_seller_name` coincide con Airtable.

### 26.5 Conversaciones desordenadas

Revisar:

- `hooks/useMessages.ts` debe ordenar por `created_at` y `id`.
- Los inserts desde n8n deben mandar `created_at` real si quieren respetar hora de WhatsApp.
- Si varios mensajes tienen mismo timestamp e IDs no monotonicamente ordenables, conviene agregar columna `whatsapp_message_timestamp` o `sequence`.

## 27. Mejoras tecnicas recomendadas

Estas no son obligatorias para el funcionamiento actual, pero harian el sistema mas robusto.

1. Agregar schema SQL completo del proyecto.
2. Agregar columna `whatsapp_timestamp` en `messages`.
3. Agregar columna `source_sequence` o `wa_message_order` para orden perfecto cuando n8n inserta lote.
4. Normalizar todos los textos mojibakeados del repo a UTF-8 correcto.
5. Centralizar estilos en tokens CSS en vez de inline styles.
6. Crear tests de API routes con mocks de Supabase/Evolution.
7. Crear tests E2E para:
   - login,
   - abrir chat,
   - enviar texto,
   - mostrar attachment,
   - pausa/reanudar bot.
8. Agregar observabilidad:
   - logs estructurados,
   - request IDs,
   - tabla de errores de integracion,
   - dashboard de fallos Evolution.
9. Separar inbound media y outbound media con idempotency keys para evitar duplicados.
10. Crear admin UI para `evolution_instances`.

## 28. Resumen mental para un nuevo desarrollador

Si un desarrollador nuevo tiene que entender la app rapido:

1. Airtable es la fuente de leads y datos comerciales.
2. Supabase Auth decide que vendedor entra.
3. `seller_profiles` conecta usuario Supabase con vendedor Airtable y `client_id`.
4. `/chats` trae leads de Airtable y mensajes de Supabase.
5. `ChatList` maneja bandeja, previews, filtros y seleccion.
6. `ChatContainer` maneja la conversacion abierta.
7. `useMessages` es la fuente de verdad visual del hilo.
8. Enviar algo siempre pasa por una API route Next.
9. Las API routes hablan con Evolution API y luego guardan en Supabase.
10. n8n alimenta mensajes entrantes y media.
11. Los adjuntos viven en Supabase Storage privado.
12. Airtable se actualiza para bot pause/resume/stage.
13. Evolution necesita instancia correcta por lead.
14. Las WhatsApp keys son indispensables para editar/borrar mensajes reales.

