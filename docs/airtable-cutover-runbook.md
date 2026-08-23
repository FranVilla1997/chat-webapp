# Runbook: corte de Airtable → Sentinel (tenant Roller Cheaper)

Fecha: 2026-07-13. Objetivo: hacer el cutover en el día.
Complementa `docs/airtable-exit-analysis.md` (v2).

## ESTADO DE EJECUCIÓN (2026-07-14 ~02:30 ART)

- ✅ A1 Backup: 3.555 registros (8 tablas) + 92 comprobantes de venta descargados
  en `SCALA APPS/airtable-backup-2026-07-13/`.
- ✅ A4 Backend Railway sano (`/health` ok, build phase3a).
- ✅ B1 Leads refrescados: 2.060 nuevos + 1.364 actualizados → 3.425 deals/contacts.
- ✅ B2 Config de Clara migrada (tono, contexto, criterios, horario) + 13 media assets.
- ✅ B3 Ventas: 79/79 reales migradas vía `scripts/import-roller-sales.ts` (nuevo,
  con fallback por teléfono para leads duplicados; 1 registro de prueba descartado).
- ✅ B4 `fields_to_collect` cargado (5 campos) · `ai_model` → `claude-sonnet-4-6`
  (el migrador había dejado Haiku; los tenants prod usan Sonnet).
- ✅ B5 Instancias RC Linea 1/2/Cortinado reasignadas al client Roller;
  `sentinel_config.evolution_instance_id` → "RC Linea 2". (El `is_default` global
  lo retiene Nico por constraint único global — no afecta a Roller.)
- ✅ B6 SEGURO PUESTO: `followup_enabled=false` + pausa global hasta 2026-07-15 12:00 UTC.
  Nota: el migrador creó la config con `followup_enabled=true`; se detectó y apagó a
  los ~3 minutos. Verificado sin daño (0 skipped, 0 sends de Sentinel, vencidos intactos).
- ✅ Pre-check C4b: 1.398/1.398 followups pendientes matchean deal por external_lead_id.
- ✅ Verificado: el handler responde por la MISMA línea que recibe (multi-línea OK).
- ⚠️ Pendiente antes de encender followups: parche a `followup/runner.ts` (usa
  `config.evolution_instance_id` fijo; debe usar `deal.metadata.source_instance` con
  fallback al default) — si no, todos los followups salen por RC Linea 2.
- ✅ A3/B7 (usuario): dashboard y playground validados ("funciona").
- ✅ **C2 WEBHOOKS CORTADOS (2026-07-14 ~02:45 ART)**: RC Linea 1, 2 y Cortinado →
  `https://scala-sentinel-backend-production.up.railway.app/webhook/rece0aEMD5iowEALZ`
  (antes las 3 iban a `https://frvilla.app.n8n.cloud/webhook/roller-cheaper`).
  Config previa guardada en `SCALA APPS/airtable-backup-2026-07-13/webhooks-rollback.json`.
  Nota: cada línea tiene su propia apikey de Evolution (están en `evolution_instances`).
- ✅ C4 Re-key ejecutado (`scripts/rekey-roller-history.ts`, nuevo): 86.004 messages +
  7.075 attachments + 25.838 followups → deal UUID. Quedaron 5.040 mensajes de 4.337
  leads BORRADOS de Airtable (huérfanos históricos, ya invisibles antes; sin impacto).
- ✅ C3 n8n workflows de Roller desactivados (usuario). Segunda pasada de re-key:
  0 rezagados.
- ✅ C5 prueba end-to-end OK en dashboard Sentinel; leads reales entrando
  (contact+deal creados automáticamente por el handler).
- ✅ **CHAT-Webapp recableada a Supabase (2026-07-14 ~04:30 ART)**: `lib/airtable.ts`
  reescrita completa sobre deals/contacts/pipeline_stages/seller_profiles/sales
  conservando firmas y shapes (RecordID = deal.id; acepta `rec...` legacy vía
  external_lead_id). Smoke test `scripts/smoke-supabase-layer.ts` OK. Deploy Vercel
  prod OK. Los vendedores siguen usando su app de siempre.
  - Backfill previo: `deals.assigned_seller_id` desde backup (Ludmila 2.110 +
    Juan Manuel 1.125); flags `active` espejados a Airtable (solo Ludmi y Juan
    Manuel reciben asignación; Edgar/Camila/owner desactivados — flip en config/team).
  - Cosmética pendiente menor: algunas fechas se muestran en ISO; en ventas, la
    descripción y observaciones se muestran unidas; comprobantes viejos no
    clickeables desde la webapp (archivos a salvo en bucket + backup).
- ✅ C6 **BOT ENCENDIDO (2026-07-14 ~04:15 ART)**: pausa global removida.
  Sonnet 4.6, followups aún off.
- ✅ Multi-línea resuelto en TODOS los caminos de envío (regla: última línea por
  la que escribió el lead, `deal.metadata.source_instance`, fallback default):
  handler actualiza la línea activa en cada inbound; followup runner parcheado;
  media del agente (`core.ts`) parcheado; chat del dashboard sentinel-frontend
  parcheado; webapp resuelve server-side al enviar (`lib/lead-instance.ts`).
  Caso borde pendiente: editar/borrar en WhatsApp usa la instancia de la UI,
  puede fallar si el lead cambió de línea después del envío original.
- ✅ Fix hilos largos webapp: `useMessages` ahora trae los 800 más recientes
  (sin límite, PostgREST cortaba en los 1000 MÁS VIEJOS y "desaparecían" los
  mensajes nuevos en hilos >1000).
- ⏳ Encender `followup_enabled=true` tras observar conversaciones del bot.
- ⏳ D: bajar plan de Airtable · parche quotes app (escritura de stage muerta;
  lectura de followup_sequence sigue del Airtable congelado hasta parchear) ·
  rotar claves expuestas.

Hallazgo lateral: 725 followups en estado `failed` históricos de n8n (fallas crónicas
previas al corte) — el sistema saliente ya venía fallando en silencio.

## Datos fijos

| Qué | Valor |
|---|---|
| client_id Sentinel | `rece0aEMD5iowEALZ` |
| Base Airtable | `appU8k1VcSSrTjkq5` |
| Backend Sentinel | Railway (repo `SCALA SENTINEL/sentinel-backend`), webhook `POST /webhook/rece0aEMD5iowEALZ` |
| Instancias Evolution de Roller | `RC Linea 1`, `RC Linea 2`, `RC Linea Cortinado` (server `https://evo.scalaops.online`) |
| Owner del tenant | ya existe (`tenant_members` role owner) + 3 sellers como members |
| Ya migrado | 8 pipeline_stages con followup_sequence, 1.365 contacts+deals (al 2026-06-06), 3 seller_profiles |
| Falta | `sentinel_config`, sales (0), media, refresh de leads, re-key de messages, webhook |

Directorio de trabajo de los comandos: `C:\Users\franc\OneDrive\Escritorio\SCALA SENTINEL\sentinel-backend`
(requiere `.env` con `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AIRTABLE_API_KEY`).

---

## FASE A — Preparación (sin riesgo, ~45 min)

**A1. Backup completo de Airtable** (las 8 tablas: Clients, Leads BOT, Pipeline_Stages,
Vendedores, Ventas, Media_Assets, Métricas mensuales, Objetivos) a JSON con fecha.
Es la única copia de los datos si algo sale mal.

**A2. Congelar Airtable**: avisar al equipo que desde ahora no se edita nada a mano
(cualquier cambio manual post-backup se pierde).

**A3. Verificar acceso al dashboard** de sentinel-frontend logueado como el owner de
Roller: debe verse el tenant con su pipeline y chats (los 1.365 leads de junio).

**A4. Verificar el backend vivo**: `GET /health` y `GET /version` en la URL de Railway.

## FASE B — Datos y configuración (dry-run → commit, ~1-2 h)

**B1. Refresh de leads** (recupera las 5 semanas de drift desde el import de junio):
```bash
npx tsx scripts/import-roller-leads.ts            # dry-run: revisar conteos
npx tsx scripts/import-roller-leads.ts --commit
```
Checkpoint: en el dashboard, leads nuevos de julio visibles y stages actualizados.

**B2. Config del bot + media** (Clara: tono, contexto, criterios, horarios):
```bash
npx tsx scripts/migrate-from-airtable.ts \
  --client-id=rece0aEMD5iowEALZ \
  --airtable-base=appU8k1VcSSrTjkq5 \
  --airtable-client-rec=rece0aEMD5iowEALZ \
  --only=config,media --dry-run
# revisar output → correr sin --dry-run
```
No correr fases `stages`/`sellers` (ya existen; sellers haría upsert por email y los
actuales no tienen email → duplicaría). No correr `kb-viajes` (es de Nico).

**B3. Ventas** (hoy hay 0 en Supabase; esta fase NO es idempotente — correrla UNA vez):
```bash
npx tsx ... --only=sales --dry-run   # revisar
npx tsx ... --only=sales
```

**B4. Ajustes en el dashboard** (~30 min):
- `/config/fields`: cargar `fields_to_collect` desde el JSON de `qualification_criteria`
  (tipo_producto 30 req, medidas_info 35 req, zona_instalacion 15, cantidad_ambientes 10,
  urgencia_compra 10; min_score 40).
- `/config/identity` y `/config/ai`: revisar nombre Clara, tono, modelo/temperatura.
- `/config/instances`: OJO — el campo `evolution_instance` de Airtable dice
  "Franco Prueba" (instancia de test). Asignar las reales: RC Linea 1 / 2 / Cortinado.
- `/config/schedule`: lun–sab 09:00–19:00, TZ Buenos Aires (viene del migrador, verificar).

**B5. Reasignar las instancias Evolution al tenant Roller** (hoy figuran bajo
`scala_ops_1d2fdef2` en `evolution_instances`): update de `client_id` a
`rece0aEMD5iowEALZ` en las 3 filas (SQL en Studio o desde `/config/instances`).
Sin esto, el envío saliente del bot puede no resolver la instancia.

**B6. Arranque seguro**: activar pausa global del bot
(`sentinel_config.bot_paused_globally_until` = mañana) y `followup_enabled=false`.
El bot va a ingerir y registrar todo, sin responder, hasta que lo habilitemos.

**B7. Playground**: probar 5–10 conversaciones reales recientes (copiar del historial)
y comparar respuestas vs. la Clara actual. Ajustar tono/reglas si hace falta.

## FASE C — El corte (~30 min, en horario tranquilo)

**C1. Vendedores al dashboard**: desde `/config/team` confirmar que Edgar, Ludmila y
Camila tienen acceso (ya son tenant_members) y mostrarles la vista de chats.

**C2. Cambiar el webhook en las 3 instancias Evolution** (manager de
`evo.scalaops.online` o API): de la URL de n8n →
`https://<backend-railway>/webhook/rece0aEMD5iowEALZ`.
Hacerlo de a una, empezando por la de menor tráfico (RC Linea 1).

**C3. Desactivar los workflows n8n de Roller** (inbound + followups). NO borrarlos:
son el rollback.

**C4. Re-key del historial de mensajes** (para que Clara y el dashboard tengan la
memoria de las conversaciones en curso):
```bash
npx tsx ... --only=messages --dry-run   # revisar conteo
npx tsx ... --only=messages
```
Se corre DESPUÉS del cambio de webhook para capturar también los últimos mensajes
que n8n escribió con rec IDs. Consecuencia: CHAT-Webapp deja de mostrar los hilos
(los vendedores ya están en el dashboard de Sentinel).

**C4b. Re-key de followups pendientes** (los ~1.400 pending tienen `lead_id` con
rec IDs de Airtable; el runner de Sentinel los necesita con `deal.id` — el propio
comentario de `followup/cron.ts` advierte que sin esto se marcarían `failed`):
```sql
update followup_queue fq
set lead_id = d.id
from deals d
where fq.client_id = 'rece0aEMD5iowEALZ'
  and fq.status = 'pending'
  and d.client_id = fq.client_id
  and d.external_lead_id = fq.lead_id;
```
Correr primero como SELECT para verificar el match. Recién después de esto se puede
prender `followup_enabled` (paso C6b).

**C5. Prueba end-to-end** con un WhatsApp propio contra cada línea:
mensaje entrante → aparece en el dashboard → responder a mano → llega al teléfono.

**C6. Encender el bot**: quitar la pausa global. Monitorear las primeras
conversaciones en vivo (timeline `agent_events`). Los followups
(`followup_enabled=true`) se activan recién a las 24-48 h, cuando el bot ya demostró
comportamiento correcto.

### Rollback (si algo sale mal): 2 minutos
Volver a apuntar los webhooks de las 3 instancias a n8n + reactivar los workflows.
Los datos escritos en Supabase durante la ventana no estorban. Airtable habrá perdido
las novedades de la ventana Sentinel (aceptable si la ventana es corta).

## FASE D — Post-corte (hoy / esta semana)

- **D1.** Monitoreo del día: `agent_events`, `/health`, conversaciones entrantes.
- **D2.** Bajar el plan de Airtable YA (queda de solo lectura). Cancelar la
  suscripción tras 2–4 semanas de observación y un último export.
- **D3.** Parche al presupuestador (`roller-cheaper-quotes`): `updateLeadStage` →
  `deals`; `getStageFollowupSequence` → `pipeline_stages.followup_sequence`.
  (Corto plazo sigue funcionando: lee Airtable congelado y su escritura de stage
  queda muerta pero inofensiva.)
- **D4.** Definir el retiro de CHAT-Webapp (los vendedores ya operan en Sentinel);
  su CRM/ventas/ranking tienen equivalente en el dashboard.
- **D5.** Rotar las claves expuestas en los repos (`.env` commiteados: service_role
  de Supabase, Evolution, Anthropic, Airtable) — tarea de higiene pendiente.
- **D6.** Apagar las automatizaciones de Airtable (si alguna sigue activa) — las
  event pills ahora salen de Sentinel (`agent_events` / messages system).

## Riesgos aceptados hoy

1. Comportamiento fino del bot sin validación exhaustiva → mitigado con pausa global
   inicial, playground y activación gradual (bot → followups).
2. Fase `sales` puede duplicar si se corre dos veces → correrla una sola vez.
3. Ventana entre backup y corte: cambios de Airtable en esa ventana quedan solo en el
   refresh de B1 (correr B1 lo más cerca posible del corte si pasan horas).
