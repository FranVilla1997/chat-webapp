'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export function CrmLogoutButton() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loggingOut}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        border: '1px solid rgba(229,62,62,0.28)',
        background: 'rgba(229,62,62,0.07)',
        color: '#ff8a8a',
        borderRadius: 6,
        padding: '10px 14px',
        fontSize: 12,
        fontWeight: 800,
        cursor: loggingOut ? 'default' : 'pointer',
        opacity: loggingOut ? 0.6 : 1,
      }}
    >
      {loggingOut ? 'Cerrando…' : 'Cerrar sesión'}
    </button>
  );
}
