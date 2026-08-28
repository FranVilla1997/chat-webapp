import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAirtableSellers, getAllSales, getSalesBySellerName } from '@/lib/airtable';
import { CrmSaleButton } from '@/components/crm/CrmSaleButton';
import { BusinessSalesTable } from '@/components/sales/BusinessSalesTable';
import { getSellerProfile } from '@/lib/auth';
import { hasCrmAccess } from '@/lib/crm-access';
import type { AirtableSale } from '@/lib/types';

export const dynamic = 'force-dynamic';

const MONO = `'SF Mono', 'Consolas', 'Liberation Mono', monospace`;

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions = {}) {
  if (!value) return 'Sin fecha';

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  });
}

function saleTitle(sale: AirtableSale) {
  return sale.description
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\*/g, ''))
    .find(Boolean) ?? 'Venta sin descripcion';
}

function statusColor(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes('confirm')) return { color: '#6bdda1', bg: 'rgba(107,221,161,0.12)', border: 'rgba(107,221,161,0.26)' };
  if (normalized.includes('pend')) return { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.28)' };
  if (normalized.includes('cancel')) return { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.26)' };
  return { color: '#a8a8b3', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.08)' };
}

export default async function SalesPage() {
  const profile = await getSellerProfile();
  const crmAccess = profile ? await hasCrmAccess(profile.user_id) : false;
  // Hay sesión pero no perfil: mandarlo a /login lo mete en un loop de
  // redirects (middleware rebota /login a / con sesión). Ver app/sin-perfil.
  if (!profile) redirect('/sin-perfil');

  const sellerName = profile.airtable_seller_name ?? profile.name ?? '';
  // El dueño (rol owner/admin) ve TODAS las ventas del negocio, con vendedor;
  // cada vendedor sigue viendo solo las suyas.
  const sales = crmAccess
    ? await getAllSales()
    : sellerName
      ? await getSalesBySellerName(sellerName)
      : [];
  const sellerOptions = crmAccess
    ? (await getAirtableSellers().catch(() => [])).filter((seller) => seller.active).map((seller) => ({ id: seller.id, name: seller.name }))
    : [];
  const totalAmount = sales.reduce((sum, sale) => sum + (sale.amount || 0), 0);
  const confirmedSales = sales.filter((sale) => sale.status.toLowerCase().includes('confirm'));
  const confirmedAmount = confirmedSales.reduce((sum, sale) => sum + (sale.amount || 0), 0);
  const latestSale = sales[0];

  return (
    <main style={{
      height: '100svh',
      overflowY: 'auto',
      overflowX: 'hidden',
      background: '#050508',
      color: '#e4e4e8',
      padding: '28px min(4vw, 44px) 42px',
      fontFamily: 'inherit',
    }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, marginBottom: 26 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <Image
              src="/logo/scala-logo.svg"
              alt="SCALA"
              width={92}
              height={12}
              priority
              style={{ filter: 'brightness(0) invert(1)', opacity: 0.92 }}
            />
            <span style={{
              height: 22,
              width: 1,
              background: '#1e1e2a',
              display: 'inline-block',
            }} />
            <p style={{
              margin: 0,
              color: '#6bdda1',
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              fontFamily: MONO,
            }}>
              Ventas registradas
            </p>
          </div>
          <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
            {crmAccess ? 'Ventas del negocio' : `Ventas de ${sellerName || 'vendedor'}`}
          </h1>
          <p style={{ margin: '8px 0 0', color: '#848494', fontSize: 13 }}>
            Ordenadas por fecha de compra, de la mas reciente a la mas antigua.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {crmAccess && (
            <Link
              href="/crm"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                border: '1px solid rgba(24,93,232,0.28)',
                background: 'rgba(24,93,232,0.08)',
                color: '#8ab4ff',
                borderRadius: 6,
                padding: '10px 14px',
                textDecoration: 'none',
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              Control CRM
            </Link>
          )}
          <Link
            href="/sales/ranking"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              border: '1px solid rgba(107,221,161,0.28)',
              background: 'rgba(107,221,161,0.08)',
              color: '#6bdda1',
              borderRadius: 6,
              padding: '10px 14px',
              textDecoration: 'none',
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            Ver ranking
          </Link>
          <CrmSaleButton sellerMode />
          <Link
            href="/chats"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              border: '1px solid rgba(255,255,255,0.10)',
              background: '#12121a',
              color: '#e4e4e8',
              borderRadius: 6,
              padding: '10px 14px',
              textDecoration: 'none',
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            Volver al chat
          </Link>
        </div>
      </header>

      <section style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 12,
        marginBottom: 18,
      }}>
        <SummaryCard label="Ventas" value={String(sales.length)} />
        <SummaryCard label="Total registrado" value={formatCurrency(totalAmount)} />
        <SummaryCard
          label="Confirmadas"
          value={formatCurrency(confirmedAmount)}
          detail={latestSale ? `Ultima: ${formatDate(latestSale.purchaseDate || latestSale.registeredAt, { hour: undefined, minute: undefined })}` : 'Sin ventas'}
        />
      </section>

      {crmAccess ? (
        <BusinessSalesTable
          sellers={sellerOptions}
          rows={sales.map((sale) => ({
            id: sale.id,
            dateLabel: formatDate(sale.purchaseDate, { hour: undefined, minute: undefined }),
            registeredLabel: `Reg. ${formatDate(sale.registeredAt || sale.createdTime)}`,
            title: saleTitle(sale),
            description: sale.description,
            sellerName: sale.sellerName,
            paymentMethod: sale.paymentMethod,
            status: sale.status,
            confirmed: sale.status.toLowerCase().includes('confirm'),
            amount: sale.amount,
            purchaseDate: (sale.purchaseDate || sale.registeredAt || sale.createdTime || '').slice(0, 10),
            leadCount: sale.leadRecordIds.length,
            receiptUrl: sale.receipts[0]?.url,
          }))}
        />
      ) : (
      <section style={{
        border: '1px solid #1e1e2a',
        background: '#0a0a0f',
        borderRadius: 8,
        overflowX: 'auto',
        overflowY: 'hidden',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '118px 1.4fr 130px 110px 132px 118px',
          gap: 12,
          padding: '12px 14px',
          background: '#12121a',
          borderBottom: '1px solid #1e1e2a',
          color: '#848494',
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontFamily: MONO,
          minWidth: 920,
        }}>
          <span>Fecha</span>
          <span>Descripcion</span>
          <span>Pago</span>
          <span>Estado</span>
          <span style={{ textAlign: 'right' }}>Monto</span>
          <span>Comprobante</span>
        </div>

        {sales.length === 0 ? (
          <div style={{ padding: 46, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 15, color: '#e4e4e8', fontWeight: 700 }}>Todavia no hay ventas registradas</p>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#666676' }}>
              Cuando este vendedor registre una venta, va a aparecer aca.
            </p>
          </div>
        ) : (
          sales.map((sale) => {
            const colors = statusColor(sale.status);
            return (
              <article
                key={sale.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '118px 1.4fr 130px 110px 132px 118px',
                  gap: 12,
                  alignItems: 'center',
                  padding: '14px',
                  borderBottom: '1px solid #1e1e2a',
                  minWidth: 920,
                }}
              >
                <div>
                  <p style={{ margin: 0, color: '#e4e4e8', fontSize: 12, fontWeight: 700 }}>
                    {formatDate(sale.purchaseDate, { hour: undefined, minute: undefined })}
                  </p>
                  <p style={{ margin: '4px 0 0', color: '#505060', fontSize: 10, fontFamily: MONO }}>
                    Reg. {formatDate(sale.registeredAt || sale.createdTime)}
                  </p>
                </div>

                <div style={{ minWidth: 0 }}>
                  <p title={sale.description} style={{
                    margin: 0,
                    color: '#f2f2f4',
                    fontSize: 13,
                    fontWeight: 700,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {saleTitle(sale)}
                  </p>
                  <p style={{
                    margin: '5px 0 0',
                    color: '#666676',
                    fontSize: 11,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {sale.leadRecordIds.length ? `${sale.leadRecordIds.length} lead vinculado` : 'Sin lead vinculado'}
                    {sale.observations ? ` · ${sale.observations}` : ''}
                  </p>
                </div>

                <span style={{ color: '#a8a8b3', fontSize: 12 }}>
                  {sale.paymentMethod || 'Sin dato'}
                </span>

                <span style={{
                  width: 'fit-content',
                  border: `1px solid ${colors.border}`,
                  background: colors.bg,
                  color: colors.color,
                  borderRadius: 999,
                  padding: '4px 8px',
                  fontSize: 10,
                  fontWeight: 800,
                  fontFamily: MONO,
                  letterSpacing: '0.04em',
                }}>
                  {sale.status || 'Sin estado'}
                </span>

                <strong style={{ textAlign: 'right', color: '#f2f2f4', fontSize: 13 }}>
                  {formatCurrency(sale.amount)}
                </strong>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {sale.receipts.length ? sale.receipts.slice(0, 2).map((receipt, index) => (
                    <a
                      key={`${receipt.url}-${index}`}
                      href={receipt.url}
                      target="_blank"
                      rel="noreferrer"
                      title={receipt.filename}
                      style={{
                        color: '#8ab4ff',
                        border: '1px solid rgba(24,93,232,0.25)',
                        background: 'rgba(24,93,232,0.08)',
                        borderRadius: 5,
                        padding: '5px 7px',
                        fontSize: 10,
                        fontWeight: 800,
                        textDecoration: 'none',
                        maxWidth: 96,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Archivo {index + 1}
                    </a>
                  )) : (
                    <span style={{ color: '#505060', fontSize: 11 }}>Sin archivo</span>
                  )}
                  {sale.receipts.length > 2 ? (
                    <span style={{ color: '#666676', fontSize: 10, alignSelf: 'center' }}>+{sale.receipts.length - 2}</span>
                  ) : null}
                </div>

              </article>
            );
          })
        )}
      </section>
      )}
    </main>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div style={{
      border: '1px solid #1e1e2a',
      background: '#0a0a0f',
      borderRadius: 8,
      padding: 16,
    }}>
      <p style={{
        margin: '0 0 8px',
        color: '#6bdda1',
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontFamily: MONO,
      }}>
        {label}
      </p>
      <strong style={{ display: 'block', fontSize: 24, lineHeight: 1, color: '#f2f2f4' }}>
        {value}
      </strong>
      {detail ? (
        <span style={{ display: 'block', marginTop: 8, color: '#666676', fontSize: 11 }}>
          {detail}
        </span>
      ) : null}
    </div>
  );
}
