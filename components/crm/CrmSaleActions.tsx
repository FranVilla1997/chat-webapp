'use client';

import { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export type EditableSale = {
  id: string;
  description: string;
  amount: number;
  purchaseDate: string; // YYYY-MM-DD
  paymentMethod: string;
  status: string;
  sellerName: string;
};

type SellerOption = { id: string; name: string };

const PAYMENT_METHODS = ['Transferencia', 'Tarjeta', 'Efectivo', 'Cheque', 'Otro'];
const STATUSES = ['Confirmada', 'Pendiente de pago', 'Cancelada'];

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: '#12121a',
  border: '1px solid #26263a',
  borderRadius: 6,
  color: '#f2f2f4',
  fontSize: 13,
  padding: '9px 10px',
  outline: 'none',
};

const labelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#848494',
};

export type SavedSaleValues = {
  description: string;
  amount: number;
  purchaseDate: string;
  paymentMethod: string;
  status: string;
  sellerRecordId: string;
};

export function CrmSaleActions({ sale, sellers, onSaved, onDeleted }: {
  sale: EditableSale;
  sellers: SellerOption[];
  onSaved?: (values: SavedSaleValues) => void;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState(sale.description);
  const [amount, setAmount] = useState(String(sale.amount));
  const [purchaseDate, setPurchaseDate] = useState(sale.purchaseDate);
  const [paymentMethod, setPaymentMethod] = useState(sale.paymentMethod || 'Transferencia');
  const [status, setStatus] = useState(sale.status || 'Confirmada');
  const [sellerRecordId, setSellerRecordId] = useState(
    () => sellers.find((seller) => seller.name === sale.sellerName)?.id ?? '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/sales/${sale.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          amount,
          purchaseDate,
          paymentMethod,
          status,
          sellerRecordId: sellerRecordId || null,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((result as { error?: string }).error ?? 'No se pudo guardar.');
      setOpen(false);
      onSaved?.({
        description: description.trim(),
        amount: Number(String(amount).replace(/\./g, '').replace(',', '.')),
        purchaseDate,
        paymentMethod,
        status,
        sellerRecordId,
      });
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('¿Eliminar esta venta definitivamente? Afecta totales y ranking.')) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/sales/${sale.id}`, { method: 'DELETE' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((result as { error?: string }).error ?? 'No se pudo eliminar.');
      setOpen(false);
      onDeleted?.();
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo eliminar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          border: '1px solid rgba(24,93,232,0.35)',
          background: 'rgba(24,93,232,0.10)',
          color: '#8ab4ff',
          borderRadius: 5,
          padding: '5px 10px',
          fontSize: 11,
          fontWeight: 800,
          cursor: 'pointer',
        }}
      >
        Editar
      </button>

      {open ? (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(6px)',
            padding: 16,
          }}
        >
          <form
            onSubmit={handleSubmit}
            role="dialog"
            aria-modal="true"
            style={{
              width: 'min(94vw, 460px)',
              background: '#0a0a0f',
              border: '1px solid #1e1e2a',
              borderRadius: 12,
              padding: 22,
              display: 'grid',
              gap: 13,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, color: '#f2f2f4', fontSize: 17 }}>Editar venta</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                aria-label="Cerrar"
                style={{ border: '1px solid #26263a', background: 'transparent', color: '#848494', borderRadius: 6, padding: '4px 9px', cursor: 'pointer' }}
              >
                x
              </button>
            </div>

            <label style={{ display: 'grid', gap: 5 }}>
              <span style={labelStyle}>Descripción</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} required />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ display: 'grid', gap: 5 }}>
                <span style={labelStyle}>Monto (ARS)</span>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} required />
              </label>
              <label style={{ display: 'grid', gap: 5 }}>
                <span style={labelStyle}>Fecha de compra</span>
                <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} style={inputStyle} required />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ display: 'grid', gap: 5 }}>
                <span style={labelStyle}>Método de pago</span>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} style={inputStyle}>
                  {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 5 }}>
                <span style={labelStyle}>Estado</span>
                <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
                  {STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            </div>

            <label style={{ display: 'grid', gap: 5 }}>
              <span style={labelStyle}>Vendedor responsable</span>
              <select value={sellerRecordId} onChange={(e) => setSellerRecordId(e.target.value)} style={inputStyle}>
                <option value="">Venta general - sin vendedor</option>
                {sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}
              </select>
            </label>

            {error ? <p style={{ margin: 0, color: '#ff8a8a', fontSize: 12 }}>{error}</p> : null}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 4 }}>
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                style={{ border: '1px solid rgba(229,62,62,0.35)', background: 'rgba(229,62,62,0.08)', color: '#ff8a8a', borderRadius: 6, padding: '9px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
              >
                Eliminar
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  style={{ border: '1px solid #26263a', background: 'transparent', color: '#a8a8b3', borderRadius: 6, padding: '9px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  style={{ border: '1px solid rgba(24,93,232,0.6)', background: '#185de8', color: '#fff', borderRadius: 6, padding: '9px 16px', fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: busy ? 0.7 : 1 }}
                >
                  {busy ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
