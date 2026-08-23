import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server';

const SIGNED_URL_TTL_SECONDS = 60 * 10;

interface RouteContext {
  params: {
    id: string;
  };
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const auth = createSupabaseServerClient();
  const { data: { session } } = await auth.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createSupabaseServiceClient();
  const { data: profile } = await service
    .from('seller_profiles')
    .select('client_id')
    .eq('user_id', session.user.id)
    .single();

  if (!profile?.client_id) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
  }

  const { data: attachment, error } = await service
    .from('message_attachments')
    .select('*')
    .eq('id', params.id)
    .eq('client_id', profile.client_id)
    .single();

  if (error || !attachment) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
  }

  // Los assets que envía el bot (send_media) se guardan con public_url y sin
  // storage_path: no hay nada que firmar, se sirven directo.
  if (!attachment.storage_path && attachment.public_url) {
    return NextResponse.json({ url: attachment.public_url, expiresIn: null });
  }

  const { data: signed, error: signedError } = await service.storage
    .from(attachment.storage_bucket)
    .createSignedUrl(attachment.storage_path, SIGNED_URL_TTL_SECONDS);

  if (signedError || !signed?.signedUrl) {
    return NextResponse.json({ error: signedError?.message ?? 'Could not sign media URL' }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS });
}
