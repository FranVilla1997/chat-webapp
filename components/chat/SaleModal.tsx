'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { LeadInfo } from '@/lib/types';

type SellerOption = {
  id: string;
  name: string;
};

interface SaleModalProps {
  open: boolean;
  leadId: string;
  clientId: string;
  leadPhone: string;
  leadInfo?: LeadInfo;
  onClose: () => void;
  onCreated?: (saleId: string, warnings?: string[]) => void;
}

function todayInputValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function defaultDescription(leadInfo?: LeadInfo) {
  const product = leadInfo?.productType?.trim();
  const measurements = leadInfo?.measurementsInfo?.trim();
  if (product && measurements) return `${product} - ${measurements}`;
  if (product) return product;
  return '';
}

export function SaleModal({ open, leadId, clientId, leadPhone, leadInfo, onClose, onCreated }: SaleModalProps) {
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [sellerRecordId, setSellerRecordId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(todayInputValue());
  const [paymentMethod, setPaymentMethod] = useState('Transferencia');
  const [status, setStatus] = useState('Confirmada');
  const [observations, setObservations] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leadName = leadInfo?.name || leadPhone;
  const canSubmit = sellerRecordId && description.trim() && amount.trim() && purchaseDate && receipt && !submitting;
  const receiptLabel = useMemo(() => {
    if (!receipt) return 'Subir comprobante';
    const mb = receipt.size / 1024 / 1024;
    return `${receipt.name} · ${mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.ceil(receipt.size / 1024)} KB`}`;
  }, [receipt]);

  useEffect(() => {
    if (!open) return;
    setDescription(defaultDescription(leadInfo));
    setAmount('');
    setPurchaseDate(todayInputValue());
    setPaymentMethod('Transferencia');
    setStatus('Confirmada');
    setObservations('');
    setError(null);
    setReceipt(null);
    setLoadingOptions(true);

    fetch('/api/sales/options')
      .then(async (res) => {
        const data = await res.json().catch(() => ({})) as { sellers?: SellerOption[]; defaultSellerId?: string; error?: string };
        if (!res.ok) throw new Error(data.error ?? 'No se pudieron cargar los vendedores.');
        setSellers(data.sellers ?? []);
        setSellerRecordId(data.defaultSellerId ?? data.sellers?.[0]?.id ?? '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar los vendedores.'))
      .finally(() => setLoadingOptions(false));
    // Deliberadamente no dependemos del objeto completo leadInfo: ChatContainer lo
    // recrea con frecuencia y eso limpiaba el archivo seleccionado.
  }, [leadId, open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || !receipt) return;
    setSubmitting(true);
    setError(null);

    const form = new FormData();
    form.set('leadId', leadId);
    form.set('clientId', clientId);
    form.set('sellerRecordId', sellerRecordId);
    form.set('description', description.trim());
    form.set('amount', amount.trim());
    form.set('purchaseDate', purchaseDate);
    form.set('paymentMethod', paymentMethod);
    form.set('status', status);
    form.set('observations', observations.trim());
    form.set('receipt', receipt);

    try {
      const response = await fetch('/api/sales', {
        method: 'POST',
        body: form,
      });
      const result = await response.json().catch(() => ({})) as { error?: string; saleId?: string; warnings?: string[] };
      if (!response.ok) throw new Error(result.error ?? 'No se pudo registrar la venta.');
      onCreated?.(result.saleId ?? '', result.warnings);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la venta.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 80,
      background: 'rgba(0,0,0,0.68)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <form onSubmit={handleSubmit} style={{
        width: '100%', maxWidth: 520,
        background: '#0f131d',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 18,
        boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
        color: '#f4f7fb',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '22px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <p style={{ margin: '0 0 6px', color: '#35E58A', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Registrar venta
            </p>
            <h2 style={{ margin: 0, fontSize: 22, lineHeight: 1.1 }}>Venta cerrada</h2>
            <p style={{ margin: '8px 0 0', color: '#98A2B3', fontSize: 13 }}>
              {leadName}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} style={{
            width: 34, height: 34, borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.04)', color: '#A4ADBD',
            cursor: 'pointer',
          }}>
            ×
          </button>
        </div>

        <div style={{ padding: 24, display: 'grid', gap: 14 }}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Vendedor</span>
            <select value={sellerRecordId} onChange={(event) => setSellerRecordId(event.target.value)} disabled={loadingOptions || submitting} style={inputStyle}>
              <option value="">{loadingOptions ? 'Cargando vendedores...' : 'Seleccionar vendedor'}</option>
              {sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}
            </select>
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>Descripción de lo vendido</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.45 }} placeholder="Ej: Cortina roller blackout con instalación" />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Monto</span>
              <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" style={inputStyle} placeholder="Ej: 350000" />
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Fecha de compra</span>
              <input value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} type="date" style={inputStyle} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Método de pago</span>
              <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} style={inputStyle}>
                <option>Transferencia</option>
                <option>Tarjeta</option>
                <option>Efectivo</option>
                <option>Cheque</option>
                <option>Otro</option>
              </select>
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Estado</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)} style={inputStyle}>
                <option>Confirmada</option>
                <option>Pendiente de pago</option>
                <option>Cancelada</option>
              </select>
            </label>
          </div>

          <div style={fieldStyle}>
            <span style={labelStyle}>Comprobante de pago</span>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(event) => setReceipt(event.target.files?.[0] ?? null)}
              style={{ display: 'none' }}
              id="sale-receipt-input"
            />
            <label htmlFor="sale-receipt-input" style={{
              ...inputStyle,
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: receipt ? '#F4F7FB' : '#6F7A8C',
            }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{receiptLabel}</span>
              <span style={{ color: '#2563EB', fontWeight: 800 }}>Elegir</span>
            </label>
          </div>

          <label style={fieldStyle}>
            <span style={labelStyle}>Observaciones</span>
            <textarea value={observations} onChange={(event) => setObservations(event.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.45 }} placeholder="Opcional" />
          </label>

          {error ? (
            <div style={{
              border: '1px solid rgba(239,68,68,0.28)',
              background: 'rgba(239,68,68,0.09)',
              color: '#FCA5A5',
              padding: '10px 12px',
              borderRadius: 10,
              fontSize: 12,
              lineHeight: 1.45,
            }}>
              {error}
            </div>
          ) : null}
        </div>

        <div style={{ padding: '16px 24px 22px', display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button type="button" onClick={onClose} disabled={submitting} style={secondaryButtonStyle}>Cancelar</button>
          <button type="submit" disabled={!canSubmit} style={{
            ...primaryButtonStyle,
            opacity: canSubmit ? 1 : 0.45,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}>
            {submitting ? 'Registrando...' : 'Registrar venta'}
          </button>
        </div>
      </form>
    </div>
  );
}

const fieldStyle: CSSProperties = {
  display: 'grid',
  gap: 7,
};

const labelStyle: CSSProperties = {
  color: '#A4ADBD',
  fontSize: 12,
  fontWeight: 700,
};

const inputStyle: CSSProperties = {
  width: '100%',
  border: '1px solid rgba(255,255,255,0.1)',
  background: '#161A20',
  color: '#F4F7FB',
  borderRadius: 10,
  padding: '11px 12px',
  font: 'inherit',
  fontSize: 13,
  outline: 'none',
};

const secondaryButtonStyle: CSSProperties = {
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.04)',
  color: '#F4F7FB',
  borderRadius: 10,
  padding: '10px 14px',
  fontWeight: 800,
  cursor: 'pointer',
};

const primaryButtonStyle: CSSProperties = {
  border: '1px solid rgba(37,99,235,0.45)',
  background: '#2563EB',
  color: 'white',
  borderRadius: 10,
  padding: '10px 15px',
  fontWeight: 900,
};
