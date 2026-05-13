interface SendTextPayload {
  number: string;
  text: string;
}

export async function sendWhatsAppMessage(
  instance: string,
  number: string,
  text: string
): Promise<void> {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error('Evolution API not configured');
  }

  const payload: SendTextPayload = { number, text };

  const response = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Evolution API error ${response.status}: ${body}`);
  }
}

export async function sendWhatsAppAudio(
  instance: string,
  number: string,
  audioBase64: string
): Promise<void> {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;

  if (!baseUrl || !apiKey) throw new Error('Evolution API not configured');

  const url = `${baseUrl}/message/sendWhatsAppAudio/${encodeURIComponent(instance)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({ number, audio: audioBase64, encoding: true }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.log('[audio] error:', response.status, body);
    throw new Error(`Evolution API audio error ${response.status}: ${body}`);
  }
}

export type WhatsAppMediaType = 'image' | 'video' | 'document';

export async function sendWhatsAppMedia(
  instance: string,
  number: string,
  input: {
    mediaUrl: string;
    mediaType: WhatsAppMediaType;
    mimeType: string;
    fileName: string;
    caption?: string;
  }
): Promise<void> {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;

  if (!baseUrl || !apiKey) throw new Error('Evolution API not configured');

  const response = await fetch(`${baseUrl}/message/sendMedia/${encodeURIComponent(instance)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({
      number,
      mediatype: input.mediaType,
      mimetype: input.mimeType,
      media: input.mediaUrl,
      fileName: input.fileName,
      caption: input.caption ?? '',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Evolution API media error ${response.status}: ${body}`);
  }
}
