'use client';

import { useState } from 'react';
import { CrmSaleActions } from './CrmSaleActions';

const MONO = `'SF Mono', 'Consolas', 'Liberation Mono', monospace`;

export type CrmSaleRow = {
  id: string;
  dateLabel: string;
  title: string;
  description: string;
  sellerName: string;
  paymentMethod: string;
  status: string;
  confirmed: boolean;
  amount: number;
  purchaseDate: string; // YYYY-MM-DD
};

type SellerOption = { id: string; name: string };

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value || 0);
}

function dateLabelFrom(purchaseDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) return purchaseDate;
  const [year, month, day] = purchaseDate.split('-');
  return `${day}/${month}/${year}`;
}

// Lista de ventas del CRM con estado local: los datos del server vienen de una
// caché con TTL, así que tras editar/borrar el refresh puede traer datos
// viejos. El overlay local (borrados + parches) refleja la mutación al
// instante y evita el doble-borrado sobre filas zombie; cuando la caché
// expira, la verdad del server coincide con el overlay.
export function CrmSalesList({ rows, sellers }: { rows: CrmSaleRow[]; sellers: SellerOption[] }) {
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const [patches, setPatches] = useState<Record<string, Partial<CrmSaleRow>>>({});

  const visible = rows
    .filter((row) => !deletedIds.has(row.id))
    .map((row) => ({ ...row, ...patches[row.id] }));

  return (
    <section style={{ border: '1px solid #1e1e2a', background: '#0a0a0f', borderRadius: 8, overflowX: 'auto' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '126px 1.3fr 150px 120px 120px 110px 74px',
          minWidth: 900,
          gap: 12,
          padding: '12px 14px',
          background: '#12121a',
          borderBottom: '1px solid #1e1e2a',
          color: '#848494',
          fontFamily: MONO,
          fontSize: 10,
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        <span>Fecha</span>
        <span>Venta</span>
        <span>Vendedor</span>
        <span>Pago</span>
        <span>Estado</span>
        <span style={{ textAlign: 'right' }}>Monto</span>
        <span />
      </div>

      {visible.length ? (
        visible.map((sale) => (
          <article
            key={sale.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '126px 1.3fr 150px 120px 120px 110px 74px',
              minWidth: 900,
              gap: 12,
              alignItems: 'center',
              padding: '13px 14px',
              borderBottom: '1px solid #1e1e2a',
            }}
          >
            <span style={{ color: '#a8a8b3', fontSize: 12 }}>{sale.dateLabel}</span>
            <strong
              title={sale.description}
              style={{ color: '#f2f2f4', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {sale.title}
            </strong>
            <span style={{ color: '#a8a8b3', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sale.sellerName || 'General'}
            </span>
            <span style={{ color: '#a8a8b3', fontSize: 12 }}>{sale.paymentMethod || '-'}</span>
            <span style={{ color: sale.confirmed ? '#6bdda1' : '#f59e0b', fontSize: 12, fontWeight: 800 }}>
              {sale.status || '-'}
            </span>
            <strong style={{ textAlign: 'right', color: '#f2f2f4', fontSize: 13 }}>{formatCurrency(sale.amount)}</strong>
            <span style={{ textAlign: 'right' }}>
              <CrmSaleActions
                sellers={sellers}
                sale={{
                  id: sale.id,
                  description: sale.description,
                  amount: sale.amount,
                  purchaseDate: sale.purchaseDate,
                  paymentMethod: sale.paymentMethod,
                  status: sale.status,
                  sellerName: sale.sellerName,
                }}
                onDeleted={() => setDeletedIds((prev) => new Set(prev).add(sale.id))}
                onSaved={(values) => {
                  const sellerName = values.sellerRecordId
                    ? sellers.find((seller) => seller.id === values.sellerRecordId)?.name ?? ''
                    : '';
                  setPatches((prev) => ({
                    ...prev,
                    [sale.id]: {
                      description: values.description,
                      title: values.description.split('\n')[0] || sale.title,
                      amount: values.amount,
                      purchaseDate: values.purchaseDate,
                      dateLabel: dateLabelFrom(values.purchaseDate),
                      paymentMethod: values.paymentMethod,
                      status: values.status,
                      confirmed: values.status === 'Confirmada',
                      sellerName,
                    },
                  }));
                }}
              />
            </span>
          </article>
        ))
      ) : (
        <div style={{ padding: 36, textAlign: 'center' }}>
          <p style={{ margin: 0, color: '#666676', fontSize: 12 }}>Sin ventas registradas para este periodo.</p>
        </div>
      )}
    </section>
  );
}
