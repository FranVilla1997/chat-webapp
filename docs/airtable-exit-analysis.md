# Análisis de salida de Airtable

Fecha: 2026-07-13 (v2 — corregido tras analizar el proyecto SCALA SENTINEL)
Contexto: el costo de Airtable se volvió inviable. Conclusión central: **no hay que
construir el reemplazo — ya existe y se llama Sentinel**. La salida de Airtable es,
en esencia, migrar el tenant Roller Cheaper al motor Sentinel y recablear las apps
satélite (chat webapp y presupuestador) a las tablas de Sentinel.

Proyecto Sentinel: `C:\Users\franc\OneDrive\Escritorio\SCALA SENTINEL`
- `sentinel-backend`: Node 22 + Fastify 5 en Railway. Webhook directo de Evolution
  (`POST /webhook/:client_id`), loop agéntico con guardrails, multi-proveedor LLM
  (Anthropic default, Sonnet conversación / Haiku followups), crons de followups e
  integraciones. Persistencia 100% Supabase (mismo proyecto `iydmoeluzzpgevmdvoap`).
- `sentinel-frontend`: dashboard admin multi-tenant Next 14 (config completa del bot,
  pipeline kanban, chats/leads, entrenamiento, reglas, evals, rankings, vista vendedor).
- En producción con varios tenants reales (Tacos, Jordi/Finques Falcon, viajes).
  Roller Cheaper sigue en n8n+Airtable, conectado por un "bridge"
  (`deals.external_lead_id`, migración `14-deals-external-lead-id.sql`).

## 1. Dónde interviene Airtable hoy (inventario, sigue válido)

### 1.1 Las 5 tablas

| Tabla | ID | Contenido | Quién escribe |
|---|---|---|---|
| Leads | `tblobaRen6YzigUwq` | Maestra de leads (~40 campos) | n8n (bot), chat webapp, quotes app |
| Etapas | `tblFMvB5bjBmq5Hl8` | stages + `followup_sequence` JSON (config del bot) | Humanos |
| Vendedores | `tblEcyyvFdnQYlTl6` | `Nombre`, `Activo`/`Estado` | Humanos |
| Ventas | `tblS74HxfH5MHAga3` | Venta + comprobantes (attachments) | Chat webapp (`/api/sales`) |
| Rankings vendedores | por nombre | Ranking mensual derivado (sincronizado a mano) | Chat webapp |

### 1.2 Consumidores

- **CHAT-Webapp** (`lib/airtable.ts`, 624 líneas): páginas `/chats`, `/conversation`,
  `/crm`, `/sales`, `/sales/ranking` + 9 API routes (leads, pause/resume-bot,
  update-lead-stage, stages, sales, sales/options, rankings/sync, airtable-webhook).
- **roller-cheaper-quotes** (`src/lib/airtable.ts`): `updateLeadStage()` al enviar
  presupuesto + `getStageFollowupSequence()` (lee `followup_sequence` de Etapas).
- **n8n (bot legado de Roller)**: crea/actualiza leads, gates de bot, datos extraídos.
- **Automatizaciones Airtable** → `POST /api/airtable-webhook` (event pills y
  `lead_notifications`).
- **Humanos**: Airtable como panel admin + deep-links `CHAT`.

## 2. Sentinel ya cubre el rol de Airtable (mapeo)

Modelo clave: en Sentinel **no hay tabla `leads`** — un lead es `contacts` (persona)
+ `deals` (oportunidad). `deal.id` es el `lead_id` del resto del ecosistema, y
`deals.external_lead_id` guarda el `rec...` de Airtable para tenants puenteados.

| Airtable (hoy) | Sentinel (Supabase) |
|---|---|
| Lead: identidad (phone, name) | `contacts` (`client_id`, `phone`, `full_name`, `source`) |
| Datos extraídos (dolor_principal, tipo_producto, medidas_info, zona, urgencia) | `contacts.metadata` jsonb + `sentinel_config.fields_to_collect` (configurable por tenant, sin schema hardcodeado) |
| Pipeline (current_stage, stage_changed_at) | `deals.stage` + `pipelines`/`pipeline_stages` + `deal_stage_history` |
| score, calificación | `deals.score`, `deals.qualified` (tool `score_and_qualify`) |
| bot_can_reply / bot_can_followup / pausas | columnas homónimas en `deals` (`bot_paused_by`, `bot_paused_until`) + pausa global `sentinel_config.bot_paused_globally_until` |
| last_message_at/from, total_messages | `deals.last_message_at`, `last_message_from`, `followup_count` (+ historial completo en `messages`) |
| proposal_*, won_amount, lost_reason | `deals.won_amount`/`won_at` + `deals.metadata` |
| source_instance | `deals.metadata.source_instance` + `evolution_instances` (default por cliente) |
| Vendedor Asignado (string) | `deals.assigned_seller_id` → `seller_profiles` (FK real, asignación weighted) |
| Tabla Etapas + followup_sequence | `pipeline_stages` (`followup_sequence` jsonb, `max_followups`, `is_terminal`, `instructions`) |
| Tabla Vendedores | `seller_profiles` + `tenant_members` |
| Tabla Ventas | `sales` |
| Tabla Rankings | dashboard `/rankings` de sentinel-frontend |
| Config del cliente | `sentinel_config` (mucho más rico: IA, horarios, tools, guardrails) |
| Automatizaciones → webhook (event pills) | `agent_events` + `messages` con `event_actor`/`event_metadata` |
| UI de administración | sentinel-frontend `config/*` (identity, ai, pipeline, knowledge, team, instances, whatsapp, versions, audit) |

Y además existe el migrador: `sentinel-backend/scripts/migrate-from-airtable.ts`
(+ `MIGRATE-FROM-AIRTABLE.md`) — one-shot idempotente en 10 fases, Airtable → Supabase,
pensado para el cutover por cliente.

## 3. Qué falta realmente (los gaps de verdad)

1. **Paridad de comportamiento del bot Roller antes del cutover.** El riesgo no es de
   datos sino de conducta: replicar en `sentinel_config` + `pipeline_stages` +
   `behavior_rules`/KB lo que hoy hace el flujo n8n de Roller (prompts, secuencias,
   reglas). Ya existe `seed-roller-config` como base. Validar con el playground/evals
   del propio Sentinel.
2. **Cutover del webhook de Evolution.** Las instancias de Roller hoy apuntan a n8n;
   hay que apuntarlas a `POST /webhook/:client_id` del backend en Railway. Es EL
   switch del corte (reversible: se vuelve a apuntar a n8n).
3. **Correr el migrador para Roller** y verificar el bridge de IDs: el historial
   (`messages.lead_id`, `followup_queue.lead_id`, `message_attachments.lead_id`) está
   keyeado por `rec...` de Airtable; Sentinel usa `deals.id` (uuid) con
   `external_lead_id` como puente. Verificar que la vinculación de mensajes
   (commit "linkear messages por external_lead_id") deje el historial visible.
4. **Recablear CHAT-Webapp** — o retirarla. `lib/airtable.ts` pasa a leer/escribir
   `deals`/`contacts`/`pipeline_stages`/`sales`. PERO: sentinel-frontend ya tiene UI
   de chat, pipeline, rankings y vista vendedor → decisión estratégica: ¿vale la pena
   recablear la webapp o se migran los vendedores directo al frontend de Sentinel?
   Hoy hay 3 UIs solapadas (CHAT-Webapp, sentinel-frontend, Revenue OS).
5. **Recablear roller-cheaper-quotes**: `updateLeadStage` → `deals.stage`;
   `getStageFollowupSequence` → `pipeline_stages.followup_sequence`. Diff chico.
6. **Gaps propios de Sentinel** (menores, verificar si importan para Roller):
   - No hay `last_message_summary` ni contador dedicado `total_messages`.
   - Fase 3 del behavior contract incompleta (consolidación, panel de salud,
     onboarding wizard); migración 17 (evals) podía estar pendiente de aplicar.
   - Sync CRM push-only (Sentinel → GHL), sin lectura de vuelta.
7. **Higiene urgente:** los `.env`/`.env.example` del sentinel-backend tienen claves
   reales commiteadas (service_role de Supabase, Evolution, Anthropic). Rotar antes
   de cualquier publicación del repo. (También CHAT-Webapp tiene `.env.local` con
   claves — mismo proyecto Supabase.)
8. **Apagado ordenado de Airtable:** export/backup completo, apagar automatizaciones
   y flujos n8n de Roller, período de observación, cancelar suscripción.

## 4. Plan de corte revisado

1. **Fase 0 — Backup + higiene:** export completo de Airtable; rotar claves expuestas.
2. **Fase 1 — Paridad de comportamiento:** seed de config Roller en Sentinel,
   replicar etapas/secuencias/reglas, validar en playground con casos reales.
3. **Fase 2 — Datos:** correr `migrate-from-airtable.ts` para Roller; verificar
   bridge `external_lead_id` y visibilidad del historial en las UIs.
4. **Fase 3 — Cutover del webhook:** instancias Evolution de Roller → sentinel-backend.
   n8n queda en standby como rollback. Ventana corta y monitoreada (agent_events +
   bot_logs).
5. **Fase 4 — Recableo de apps:** quotes app (diff chico) y decisión
   CHAT-Webapp-recableada vs. vendedores en sentinel-frontend.
6. **Fase 5 — Apagar:** automatizaciones Airtable, flujos n8n de Roller, y tras
   observación, cancelar Airtable.

Nota estratégica: esto también redefine la "migración del chat al Sentinel"
(`docs/sentinel-migration-analysis.md`): el destino natural del chat de vendedores es
la plataforma Sentinel (que ya tiene vista vendedor y chat), no reconstruirlo en
Revenue OS. Revenue OS queda como capa CRM/analítica por encima de las mismas tablas.
Conviene decidir explícitamente qué UI sobrevive antes de invertir en recableo.
