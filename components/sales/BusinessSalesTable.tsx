'use client';

import { useMemo, useState } from 'react';
import { CrmSaleActions } from '@/components/crm/CrmSaleActions';

const MONO = `'SF Mono', 'Consolas', 'Liberation Mono', monospace`;

export type BusinessSaleRow = {
  id: string;
  dateLabel: string;
  registeredLabel: string;
  title: string;
  description: string;
  sellerName: string;
  paymentMethod: string;
  status: string;
  confirmed: boolean;
  amount: number;
  purchaseDate: string; // YYYY-MM-DD
  leadCount: number;
  receiptUrl?: string;
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

function normalize(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Tabla de ventas del negocio (vista dueño): buscador + edición/eliminación
// con estado local para que la lista refleje cada cambio al instante.
export function BusinessSalesTable({ rows, sellers }: { rows: BusinessSaleRow[]; sellers: SellerOption[] }) {
  const [search, setSearch] = useState('');
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const [patches, setPatches] = useState<Record<string, Partial<BusinessSaleRow>>>({});

  const visible = useMemo(() => {
    const query = normalize(search.trim());
    return rows
      .filter((row) => !deletedIds.has(row.id))
      .map((row) => ({ ...row, ...patches[row.id] }))
      .filter((row) => {
        if (!query) return true;
        const haystack = normalize(
          `${row.title} ${row.description} ${row.sellerName} ${row.paymentMethod} ${row.status} ${row.amount} ${row.dateLabel}`,
        );
        return query.split(/\s+/).every((token) => haystack.includes(token));
      });
  }, [rows, search, deletedIds, patches]);

  return (
    <section style={{ border: '1px solid #1e1e2a', background: '#0a0a0f', borderRadius: 8 }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #1e1e2a', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por cliente, descripción, vendedor, monto o fecha…"
          style={{
            flex: 1,
            minWidth: 260,
            boxSizing: 'border-box',
            background: '#12121a',
            border: '1px solid #26263a',
            borderRadius: 6,
            color: '#f2f2f4',
            fontSize: 13,
            padding: '10px 12px',
            outline: 'none',
          }}
        />
        <span style={{ color: '#666676', fontSize: 11, fontFamily: MONO }}>
          {visible.length} de {rows.length - deletedIds.size} ventas
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '108px 1.6fr 150px 110px 132px 118px 82px',
            minWidth: 940,
            gap: 12,
            padding: '11px 14px',
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
                gridTemplateColumns: '108px 1.6fr 150px 110px 132px 118px 82px',
                minWidth: 940,
                gap: 12,
                alignItems: 'center',
                padding: '13px 14px',
                borderBottom: '1px solid #1e1e2a',
              }}
            >
              <div>
                <p style={{ margin: 0, color: '#e4e4e8', fontSize: 12, fontWeight: 700 }}>{sale.dateLabel}</p>
                <p style={{ margin: '3px 0 0', color: '#505060', fontSize: 10, fontFamily: MONO }}>{sale.registeredLabel}</p>
              </div>
              <div style={{ minWidth: 0 }}>
                <p
                  title={sale.description}
                  style={{ margin: 0, color: '#f2f2f4', fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {sale.title}
                </p>
                <p style={{ margin: '4px 0 0', color: '#666676', fontSize: 11 }}>
                  {sale.leadCount ? `${sale.leadCount} lead vinculado` : 'Sin lead vinculado'}
                  {sale.receiptUrl ? (
                    <>
                      {' · '}
                      <a href={sale.receiptUrl} target="_blank" rel="noreferrer" style={{ color: '#8ab4ff', textDecoration: 'none', fontWeight: 700 }}>
                        Ver comprobante ↗
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
              <span style={{ color: '#a8a8b3', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {sale.sellerName || 'General'}
              </span>
              <span style={{ color: '#a8a8b3', fontSize: 12 }}>{sale.paymentMethod || '-'}</span>
              <span
                style={{
                  width: 'fit-content',
                  border: `1px solid ${sale.confirmed ? 'rgba(107,221,161,0.3)' : 'rgba(245,158,11,0.3)'}`,
                  background: sale.confirmed ? 'rgba(107,221,161,0.08)' : 'rgba(245,158,11,0.08)',
                  color: sale.confirmed ? '#6bdda1' : '#f59e0b',
                  borderRadius: 999,
                  padding: '4px 9px',
                  fontSize: 10,
                  fontWeight: 800,
                  fontFamily: MONO,
                }}
              >
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
          <div style={{ padding: 42, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 14, color: '#e4e4e8', fontWeight: 700 }}>
              {search ? 'Sin resultados para esa búsqueda' : 'Todavía no hay ventas registradas'}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
