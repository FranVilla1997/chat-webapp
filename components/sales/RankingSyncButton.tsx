'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface RankingSyncButtonProps {
  month: string;
}

export function RankingSyncButton({ month }: RankingSyncButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function syncRanking() {
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch('/api/sales/rankings/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; ranking?: unknown[] };
      if (!response.ok) throw new Error(data.error ?? 'No se pudo guardar el ranking.');
      setMessage(`Ranking guardado en Airtable (${data.ranking?.length ?? 0} vendedores).`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el ranking.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
      <button
        type="button"
        onClick={() => void syncRanking()}
        disabled={loading}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          border: '1px solid rgba(107,221,161,0.32)',
          background: loading ? 'rgba(107,221,161,0.08)' : 'rgba(107,221,161,0.14)',
          color: '#6bdda1',
          borderRadius: 6,
          padding: '10px 14px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: 12,
          fontWeight: 800,
        }}
      >
        {loading ? 'Guardando...' : 'Guardar ranking en Airtable'}
      </button>
      {message ? <span style={{ color: '#6bdda1', fontSize: 11 }}>{message}</span> : null}
      {error ? <span style={{ color: '#ff8a8a', fontSize: 11, maxWidth: 360, textAlign: 'right' }}>{error}</span> : null}
    </div>
  );
}
