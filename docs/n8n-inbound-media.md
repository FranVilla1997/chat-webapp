# n8n inbound media contract

Endpoint:

```txt
POST /api/inbound-media
Header: x-webhook-secret: <N8N_MEDIA_WEBHOOK_SECRET o AIRTABLE_WEBHOOK_SECRET>
```

Payload mínimo con base64:

```json
{
  "leadId": "recXXXXXXXXXXXX",
  "clientId": "recCLIENT",
  "role": "user",
  "content": "Audio recibido",
  "mediaBase64": "<base64 sin prefijo data:>",
  "mediaType": "audio",
  "mimeType": "audio/ogg",
  "fileName": "audio-1715720000.ogg",
  "durationSeconds": 12
}
```

Payload usando URL descargable:

```json
{
  "leadId": "recXXXXXXXXXXXX",
  "clientId": "recCLIENT",
  "role": "user",
  "content": "Foto recibida",
  "mediaUrl": "https://...",
  "mediaType": "image",
  "mimeType": "image/jpeg",
  "fileName": "foto.jpg",
  "caption": "Medidas de la ventana"
}
```

Valores de `mediaType`:

```txt
audio | image | video | document
```

Antes de usar el endpoint, ejecutar `supabase/message_attachments.sql` en Supabase SQL Editor.
