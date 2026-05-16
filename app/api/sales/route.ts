import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server';
import { createSaleRecord, getPipelineStages, updateLeadFields, updateLeadStage } from '@/lib/airtable';

const ATTACHMENTS_BUCKET = 'chat-attachments';
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const PAYMENT_METHODS = new Set(['Transferencia', 'Tarjeta', 'Efectivo', 'Cheque', 'Otro']);
const SALE_STATUSES = new Set(['Confirmada', 'Pendiente de pago', 'Cancelada']);

function safeFileName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'comprobante';
}

async function ensureBucket() {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase.storage.listBuckets();
  if (data?.some((bucket) => bucket.name === ATTACHMENTS_BUCKET)) return;
  await supabase.storage.createBucket(ATTACHMENTS_BUCKET, {
    public: false,
    fileSizeLimit: 50 * 1024 * 1024,
    allowedMimeTypes: ['image/*', 'application/pdf'],
  });
}

function parseAmount(value: FormDataEntryValue | null): number {
  const raw = String(value ?? '').trim().replace(/\./g, '').replace(',', '.');
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : NaN;
}

export async function POST(req: NextRequest) {
  try {
    const auth = createSupabaseServerClient();
    const { data: { session } } = await auth.auth.getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const form = await req.formData();
    const leadId = String(form.get('leadId') ?? '').trim();
    const clientId = String(form.get('clientId') ?? '').trim();
    const sellerRecordId = String(form.get('sellerRecordId') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    const observations = String(form.get('observations') ?? '').trim();
    const purchaseDate = String(form.get('purchaseDate') ?? '').trim();
    const paymentMethod = String(form.get('paymentMethod') ?? 'Transferencia').trim();
    const status = String(form.get('status') ?? 'Confirmada').trim();
    const amount = parseAmount(form.get('amount'));
    const receipt = form.get('receipt');

    if (!leadId || !clientId || !sellerRecordId || !description || !purchaseDate || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Faltan datos obligatorios para registrar la venta.' }, { status: 400 });
    }
    if (!PAYMENT_METHODS.has(paymentMethod)) {
      return NextResponse.json({ error: 'Método de pago inválido.' }, { status: 400 });
    }
    if (!SALE_STATUSES.has(status)) {
      return NextResponse.json({ error: 'Estado de venta inválido.' }, { status: 400 });
    }
    if (!(receipt instanceof File) || receipt.size === 0) {
      return NextResponse.json({ error: 'El comprobante de pago es obligatorio.' }, { status: 400 });
    }
    if (!receipt.type.startsWith('image/') && receipt.type !== 'application/pdf') {
      return NextResponse.json({ error: 'El comprobante debe ser imagen o PDF.' }, { status: 400 });
    }
    if (receipt.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'El comprobante no puede superar 50 MB.' }, { status: 400 });
    }

    await ensureBucket();
    const service = createSupabaseServiceClient();
    const fileName = safeFileName(receipt.name || 'comprobante');
    const storagePath = `${clientId}/${leadId}/sales/${Date.now()}-${fileName}`;
    const bytes = Buffer.from(await receipt.arrayBuffer());

    const { error: uploadError } = await service.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(storagePath, bytes, {
        contentType: receipt.type || 'application/octet-stream',
        upsert: false,
      });
    if (uploadError) throw new Error(uploadError.message);

    const { data: signed, error: signedError } = await service.storage
      .from(ATTACHMENTS_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
    if (signedError || !signed?.signedUrl) throw new Error(signedError?.message ?? 'No se pudo preparar el comprobante.');

    const sale = await createSaleRecord({
      leadRecordId: leadId,
      sellerRecordId,
      description,
      amount,
      purchaseDate,
      paymentMethod: paymentMethod as 'Transferencia' | 'Tarjeta' | 'Efectivo' | 'Cheque' | 'Otro',
      status: status as 'Confirmada' | 'Pendiente de pago' | 'Cancelada',
      observations,
      receipt: {
        url: signed.signedUrl,
        filename: fileName,
      },
    });

    const warnings: string[] = [];
    try {
      await updateLeadFields(leadId, {
        won_amount: String(amount),
      });
    } catch (err) {
      console.error('Lead won_amount update failed:', err);
      warnings.push('No se pudo actualizar el monto ganado del lead.');
    }

    try {
      const stages = await getPipelineStages();
      const wonStage = stages.find((stage) => stage.name === 'cerrado_ganado');
      if (!wonStage) throw new Error('No se encontró la etapa cerrado_ganado.');
      await updateLeadStage(leadId, wonStage.id);
    } catch (err) {
      console.error('Lead won stage update failed:', err);
      warnings.push('No se pudo mover el lead a cerrado_ganado.');
    }

    return NextResponse.json({ ok: true, saleId: sale.id, warnings });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
