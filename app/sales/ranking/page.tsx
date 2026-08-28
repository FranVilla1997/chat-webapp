import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  buildSellerRanking,
  currentArgentinaMonthKey,
  getAllSales,
  getSellerRankingHistory,
  saleMonthKey,
} from '@/lib/airtable';
import { getSellerProfile } from '@/lib/auth';
import { hasCrmAccess } from '@/lib/crm-access';
import type { SellerRankingEntry } from '@/lib/types';
import { RankingSyncButton } from '@/components/sales/RankingSyncButton';

export const dynamic = 'force-dynamic';

const MONO = `'SF Mono', 'Consolas', 'Liberation Mono', monospace`;

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatMonth(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return month || 'Mes sin dato';
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
  });
}

function formatDateTime(value: string) {
  if (!value) return 'Sin sincronizar';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function uniqueMonths(currentMonth: string, history: SellerRankingEntry[], salesMonths: string[]) {
  return [...new Set([currentMonth, ...salesMonths.filter(Boolean), ...history.map((entry) => entry.month).filter(Boolean)])]
    .sort((a, b) => b.localeCompare(a));
}

function groupHistoryByMonth(history: SellerRankingEntry[]) {
  return history.reduce<Record<string, SellerRankingEntry[]>>((acc, entry) => {
    acc[entry.month] = acc[entry.month] ?? [];
    acc[entry.month].push(entry);
    return acc;
  }, {});
}

export default async function SalesRankingPage({ searchParams }: { searchParams?: { month?: string } }) {
  const profile = await getSellerProfile();
  // Hay sesión pero no perfil: mandarlo a /login lo mete en un loop de
  // redirects (middleware rebota /login a / con sesión). Ver app/sin-perfil.
  if (!profile) redirect('/sin-perfil');

  const canSyncRanking = await hasCrmAccess(profile.user_id);
  const sellerName = profile.airtable_seller_name ?? profile.name ?? '';
  const currentMonth = currentArgentinaMonthKey();
  const selectedMonth = /^\d{4}-\d{2}$/.test(String(searchParams?.month ?? ''))
    ? String(searchParams?.month)
    : currentMonth;

  const [sales, historyResult] = await Promise.all([
    getAllSales(),
    getSellerRankingHistory()
      .then((history) => ({ history, error: '' }))
      .catch((err) => ({
        history: [] as SellerRankingEntry[],
        error: err instanceof Error ? err.message : 'No se pudo leer la tabla de rankings.',
      })),
  ]);

  const liveRanking = buildSellerRanking(sales, selectedMonth);
  const myRank = liveRanking.find((entry) => entry.sellerName === sellerName);
  const leader = liveRanking[0];
  const totalMonth = liveRanking.reduce((sum, entry) => sum + entry.totalAmount, 0);
  const totalSales = liveRanking.reduce((sum, entry) => sum + entry.confirmedSales, 0);
  const months = uniqueMonths(currentMonth, historyResult.history, sales.map(saleMonthKey));
  const historyByMonth = groupHistoryByMonth(historyResult.history);

  return (
    <main style={{
      minHeight: '100svh',
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
            <span style={{ height: 22, width: 1, background: '#1e1e2a', display: 'inline-block' }} />
            <p style={{
              margin: 0,
              color: '#6bdda1',
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              fontFamily: MONO,
            }}>
              Ranking comercial
            </p>
          </div>
          <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
            Ranking de vendedores
          </h1>
          <p style={{ margin: '8px 0 0', color: '#848494', fontSize: 13 }}>
            Ventas confirmadas por monto, con vista mensual e historico guardado en Airtable.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {canSyncRanking && (
            <Link href="/crm" style={navButtonStyle}>Control CRM</Link>
          )}
          <Link href="/sales" style={navButtonStyle}>Mis ventas</Link>
          <Link href="/chats" style={navButtonStyle}>Volver al chat</Link>
          {canSyncRanking ? <RankingSyncButton month={selectedMonth} /> : null}
        </div>
      </header>

      <section style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: 12,
        marginBottom: 18,
      }}>
        <SummaryCard label="Mes" value={formatMonth(selectedMonth)} />
        <SummaryCard label="Total vendido" value={formatCurrency(totalMonth)} detail={`${totalSales} ventas confirmadas`} />
        <SummaryCard label="Lider actual" value={leader?.sellerName ?? 'Sin ventas'} detail={leader ? formatCurrency(leader.totalAmount) : 'Sin datos'} />
        <SummaryCard label="Tu posicion" value={myRank ? `#${myRank.position}` : '-'} detail={myRank ? formatCurrency(myRank.totalAmount) : 'Sin ventas este mes'} />
      </section>

      <section style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        border: '1px solid #1e1e2a',
        background: '#0a0a0f',
        borderRadius: 8,
        padding: 14,
        marginBottom: 18,
      }}>
        <div>
          <p style={{ margin: 0, color: '#f2f2f4', fontSize: 14, fontWeight: 800 }}>Mes a consultar</p>
          <p style={{ margin: '4px 0 0', color: '#666676', fontSize: 12 }}>El ranking en vivo se calcula desde la tabla Ventas.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {months.map((month) => (
            <Link
              key={month}
              href={`/sales/ranking?month=${month}`}
              style={{
                border: `1px solid ${month === selectedMonth ? 'rgba(24,93,232,0.45)' : 'rgba(255,255,255,0.08)'}`,
                background: month === selectedMonth ? 'rgba(24,93,232,0.16)' : '#12121a',
                color: month === selectedMonth ? '#8ab4ff' : '#a8a8b3',
                borderRadius: 999,
                padding: '7px 10px',
                textDecoration: 'none',
                fontSize: 11,
                fontWeight: 800,
                fontFamily: MONO,
              }}
            >
              {month}
            </Link>
          ))}
        </div>
      </section>

      {historyResult.error ? (
        <section style={{
          border: '1px solid rgba(245,158,11,0.30)',
          background: 'rgba(245,158,11,0.08)',
          borderRadius: 8,
          padding: 14,
          color: '#f59e0b',
          marginBottom: 18,
          fontSize: 12,
          lineHeight: 1.45,
        }}>
          Todavia no pude leer la tabla historica de rankings. Creala en Airtable como <strong>Rankings vendedores</strong> o configura <strong>AIRTABLE_SELLER_RANKINGS_TABLE_ID</strong>. Detalle: {historyResult.error}
        </section>
      ) : null}

      <section style={{
        border: '1px solid #1e1e2a',
        background: '#0a0a0f',
        borderRadius: 8,
        overflow: 'hidden',
        marginBottom: 22,
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '76px 1fr 140px 120px 140px',
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
          minWidth: 760,
        }}>
          <span>Pos.</span>
          <span>Vendedor</span>
          <span style={{ textAlign: 'right' }}>Monto</span>
          <span style={{ textAlign: 'right' }}>Ventas</span>
          <span style={{ textAlign: 'right' }}>Ticket prom.</span>
        </div>

        {liveRanking.length === 0 ? (
          <div style={{ padding: 42, textAlign: 'center' }}>
            <p style={{ margin: 0, color: '#f2f2f4', fontSize: 15, fontWeight: 800 }}>Sin ventas confirmadas en este mes</p>
            <p style={{ margin: '8px 0 0', color: '#666676', fontSize: 12 }}>Cuando se registren ventas confirmadas, van a aparecer aca.</p>
          </div>
        ) : (
          liveRanking.map((entry) => {
            const isMe = entry.sellerName === sellerName;
            return (
              <article
                key={`${entry.month}-${entry.sellerName}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '76px 1fr 140px 120px 140px',
                  gap: 12,
                  alignItems: 'center',
                  padding: '14px',
                  borderBottom: '1px solid #1e1e2a',
                  minWidth: 760,
                  background: isMe ? 'rgba(24,93,232,0.08)' : 'transparent',
                }}
              >
                <strong style={{ color: entry.position === 1 ? '#f59e0b' : '#f2f2f4', fontSize: 18, fontFamily: MONO }}>
                  #{entry.position}
                </strong>
                <div>
                  <p style={{ margin: 0, color: '#f2f2f4', fontSize: 14, fontWeight: 800 }}>{entry.sellerName}</p>
                  {isMe ? <p style={{ margin: '4px 0 0', color: '#8ab4ff', fontSize: 11 }}>Tu ranking del mes</p> : null}
                </div>
                <strong style={{ textAlign: 'right', color: '#f2f2f4', fontSize: 14 }}>{formatCurrency(entry.totalAmount)}</strong>
                <span style={{ textAlign: 'right', color: '#a8a8b3', fontSize: 13 }}>{entry.confirmedSales}</span>
                <span style={{ textAlign: 'right', color: '#a8a8b3', fontSize: 13 }}>{formatCurrency(entry.averageTicket)}</span>
              </article>
            );
          })
        )}
      </section>

      <section style={{
        border: '1px solid #1e1e2a',
        background: '#0a0a0f',
        borderRadius: 8,
        padding: 16,
      }}>
        <h2 style={{ margin: 0, color: '#f2f2f4', fontSize: 18 }}>Historico guardado</h2>
        <p style={{ margin: '6px 0 16px', color: '#666676', fontSize: 12 }}>
          Estos son los snapshots persistidos en Airtable. Se actualizan con el boton "Guardar ranking en Airtable".
        </p>

        {historyResult.history.length === 0 ? (
          <p style={{ margin: 0, color: '#848494', fontSize: 13 }}>Todavia no hay rankings guardados.</p>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {Object.entries(historyByMonth).map(([month, entries]) => (
              <div key={month} style={{ border: '1px solid #1e1e2a', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '10px 12px', background: '#12121a', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <strong style={{ color: '#f2f2f4', fontSize: 13 }}>{formatMonth(month)}</strong>
                  <span style={{ color: '#666676', fontSize: 11 }}>{formatDateTime(entries[0]?.calculatedAt ?? '')}</span>
                </div>
                {entries.sort((a, b) => a.position - b.position).map((entry) => (
                  <div
                    key={`${entry.month}-${entry.sellerName}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '58px 1fr 132px 96px',
                      gap: 10,
                      padding: '10px 12px',
                      borderTop: '1px solid #1e1e2a',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ color: '#a8a8b3', fontFamily: MONO, fontSize: 12 }}>#{entry.position}</span>
                    <span style={{ color: '#f2f2f4', fontSize: 13, fontWeight: 700 }}>{entry.sellerName}</span>
                    <strong style={{ color: '#f2f2f4', fontSize: 13, textAlign: 'right' }}>{formatCurrency(entry.totalAmount)}</strong>
                    <span style={{ color: '#848494', fontSize: 12, textAlign: 'right' }}>{entry.confirmedSales} ventas</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

const navButtonStyle = {
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
};

function SummaryCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div style={{
      border: '1px solid #1e1e2a',
      background: '#0a0a0f',
      borderRadius: 8,
      padding: 16,
      minWidth: 0,
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
      <strong style={{ display: 'block', fontSize: 22, lineHeight: 1.05, color: '#f2f2f4', overflowWrap: 'anywhere' }}>
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
