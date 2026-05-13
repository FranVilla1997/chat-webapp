import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ATTACHMENTS_BUCKET = 'chat-attachments';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function ensureBucket() {
  const { data } = await supabase.storage.listBuckets();
  if (data?.some((bucket) => bucket.name === ATTACHMENTS_BUCKET)) return;
  await supabase.storage.createBucket(ATTACHMENTS_BUCKET, {
    public: false,
    fileSizeLimit: 50 * 1024 * 1024,
    allowedMimeTypes: ['image/*', 'video/*', 'application/pdf'],
  });
}

function safeFileName(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'archivo';
}

export async function POST(req: NextRequest) {
  try {
    const { leadId, clientId, fileName, mimeType } = await req.json() as {
      leadId?: string;
      clientId?: string;
      fileName?: string;
      mimeType?: string;
    };

    if (!leadId || !clientId || !fileName || !mimeType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!mimeType.startsWith('image/') && !mimeType.startsWith('video/') && mimeType !== 'application/pdf') {
      return NextResponse.json({ error: 'Solo se permiten fotos, videos o PDF.' }, { status: 400 });
    }

    await ensureBucket();
    const path = `${clientId}/${leadId}/${Date.now()}-${safeFileName(fileName)}`;
    const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new Error(error?.message ?? 'No se pudo crear URL de subida.');

    return NextResponse.json({
      bucket: ATTACHMENTS_BUCKET,
      path: data.path,
      token: data.token,
      signedUrl: data.signedUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
