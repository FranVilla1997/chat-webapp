import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server';
import { createSaleRecord, getPipelineStages, updateLeadFields, updateLeadStage } from '@/lib/airtable';
import { cancelPendingFollowupsForLead } from '@/lib/followup-queue';
import { hasCrmAccess } from '@/lib/crm-access';

export const maxDuration = 60;

const ATTACHMENTS_BUCKET = 'chat-attachments';
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const PAYMENT_METHODS = new Set(['Transferencia', 'Tarjeta', 'Efectivo', 'Cheque', 'Otro']);
const SALE_STATUSES = new Set(['Confirmada', 'Pendiente de pago', 'Cancelada']);

function safeFileName(name: string) {
  return (
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'comprobante'
  );
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
  // Tolerante: los vendedores pegan "$ 358.065,05 ( 30% + 15% Desc)" — se
  // extrae el primer token numérico y se interpreta en formato AR.
  const match = String(value ?? '').match(/-?[0-9][0-9.,]*/);
  if (!match) return NaN;
  let token = match[0];
  const lastComma = token.lastIndexOf(',');
  const lastDot = token.lastIndexOf('.');
  if (lastComma > lastDot) {
    token = token.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > -1 && lastComma > -1) {
    token = token.replace(/,/g, '');
  } else if (lastDot > -1) {
    const decimals = token.length - lastDot - 1;
    if (decimals === 3 && token.split('.').length === 2) token = token.replace(/\./g, '');
  }
  const amount = Number(token.replace(/,/g, ''));
  return Number.isFinite(amount) ? amount : NaN;
}

export async function POST(req: NextRequest) {
  try {
    const auth = createSupabaseServerClient();
    const {
      data: { session },
    } = await auth.auth.getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const form = await req.formData();
    const standalone = String(form.get('standalone') ?? '') === 'true';
    const leadId = String(form.get('leadId') ?? '').trim();
    let clientId = String(form.get('clientId') ?? '').trim();
    let sellerRecordId = String(form.get('sellerRecordId') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    const observations = String(form.get('observations') ?? '').trim();
    const purchaseDate = String(form.get('purchaseDate') ?? '').trim();
    const paymentMethod = String(form.get('paymentMethod') ?? 'Transferencia').trim();
    const status = String(form.get('status') ?? 'Confirmada').trim();
    const amount = parseAmount(form.get('amount'));
    const receiptEntries = form.getAll('receipts');
    const legacyReceipt = form.get('receipt');
    const receipts = [...receiptEntries, ...(legacyReceipt ? [legacyReceipt] : [])].filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (standalone) {
      const { data: profile } = await auth.from('seller_profiles').select('*').eq('user_id', session.user.id).single();
      const isOwner = await hasCrmAccess(session.user.id);
      if (!isOwner) {
        // Vendedor: puede cargar ventas sueltas (sin lead) pero SIEMPRE a su
        // propio nombre y con comprobante obligatorio.
        if (!profile?.id) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        if (!receipts.length) {
          return NextResponse.json({ error: 'El comprobante de pago es obligatorio.' }, { status: 400 });
        }
        sellerRecordId = String(profile.id);
      }
      clientId = String(profile?.client_id ?? '').trim();
    }

    const missingChatSaleFields = !standalone && (!leadId || !sellerRecordId);
    if (missingChatSaleFields || !clientId || !description || !purchaseDate || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Faltan datos obligatorios para registrar la venta.' }, { status: 400 });
    }
    if (!PAYMENT_METHODS.has(paymentMethod)) {
      return NextResponse.json({ error: 'Método de pago inválido.' }, { status: 400 });
    }
    if (!SALE_STATUSES.has(status)) {
      return NextResponse.json({ error: 'Estado de venta inválido.' }, { status: 400 });
    }
    if (!standalone && !receipts.length) {
      return NextResponse.json({ error: 'El comprobante de pago es obligatorio.' }, { status: 400 });
    }
    if (receipts.some((receipt) => !receipt.type.startsWith('image/') && receipt.type !== 'application/pdf')) {
      return NextResponse.json({ error: 'Los comprobantes deben ser imagen o PDF.' }, { status: 400 });
    }
    if (receipts.some((receipt) => receipt.size > 50 * 1024 * 1024)) {
      return NextResponse.json({ error: 'Cada comprobante no puede superar 50 MB.' }, { status: 400 });
    }

    if (receipts.length) await ensureBucket();
    const service = createSupabaseServiceClient();
    const uploadedReceipts = await Promise.all(
      receipts.map(async (receipt, index) => {
        const fileName = safeFileName(receipt.name || 'comprobante');
        const storagePath = `${clientId}/${leadId || 'general'}/sales/${Date.now()}-${index}-${fileName}`;
        const bytes = Buffer.from(await receipt.arrayBuffer());

        const { error: uploadError } = await service.storage.from(ATTACHMENTS_BUCKET).upload(storagePath, bytes, {
          contentType: receipt.type || 'application/octet-stream',
          upsert: false,
        });
        if (uploadError) throw new Error(uploadError.message);

        const { data: signed, error: signedError } = await service.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
        if (signedError || !signed?.signedUrl) throw new Error(signedError?.message ?? 'No se pudo preparar el comprobante.');

        return {
          url: signed.signedUrl,
          filename: fileName,
          storagePath,
        };
      })
    );

    const sale = await createSaleRecord({
      leadRecordId: leadId,
      sellerRecordId,
      description,
      amount,
      purchaseDate,
      paymentMethod: paymentMethod as 'Transferencia' | 'Tarjeta' | 'Efectivo' | 'Cheque' | 'Otro',
      status: status as 'Confirmada' | 'Pendiente de pago' | 'Cancelada',
      observations,
      receipts: uploadedReceipts,
    });

    const warnings: string[] = [];
    if (leadId) {
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
        await updateLeadFields(leadId, {
          bot_can_reply: false,
          bot_can_followup: false,
          bot_paused_at: null,
          bot_resume_at: null,
          bot_paused_by: '',
        });
        await cancelPendingFollowupsForLead({
          leadId,
          clientId,
          reason: 'Venta registrada: lead cerrado ganado, seguimiento automatico cancelado.',
        });
        const { error: notificationError } = await service.from('lead_notifications').insert({
          record_id: leadId,
          client_id: clientId,
          action: 'stage_updated',
        });
        if (notificationError) console.error('Lead won stage notification failed:', notificationError);
      } catch (err) {
        console.error('Lead won stage update failed:', err);
        warnings.push('No se pudo mover el lead a cerrado_ganado.');
      }
    }

    return NextResponse.json({ ok: true, saleId: sale.id, warnings });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
