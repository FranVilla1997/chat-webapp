import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { hasCrmAccess } from '@/lib/crm-access';

export const dynamic = 'force-dynamic';

const MONO = `'SF Mono', 'Consolas', 'Liberation Mono', monospace`;

// El CRM ya no usa contraseña compartida: el acceso es por rol (owner/admin en
// tenant_members, la misma cuenta de dueño del dashboard de Sentinel). Esta
// pantalla solo informa a quien no tiene el rol.
export default async function CrmAccessPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/crm');
  if (await hasCrmAccess(session.user.id)) redirect('/crm');

  return (
    <main
      style={{
        minHeight: '100svh',
        display: 'grid',
        placeItems: 'center',
        background:
          'radial-gradient(circle at top, rgba(24,93,232,0.18), transparent 35%), #050508',
        color: '#f2f2f4',
        padding: 24,
      }}
    >
      <section
        style={{
          width: 'min(420px, 100%)',
          background: '#0a0a0f',
          border: '1px solid #1e1e2a',
          borderRadius: 10,
          padding: '28px 26px',
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#848484', fontFamily: MONO, margin: 0 }}>
          Control CRM
        </p>
        <h1 style={{ fontSize: 18, fontWeight: 800, margin: '10px 0 8px' }}>Acceso restringido</h1>
        <p style={{ fontSize: 13, color: '#a8a8b3', lineHeight: 1.5, margin: '0 0 18px' }}>
          El CRM es exclusivo del dueño de la cuenta. Ingresá con el usuario
          de dueño (el mismo que usás en el panel de Sentinel) para acceder.
        </p>
        <a
          href="/chats"
          style={{
            display: 'inline-block',
            padding: '9px 18px',
            borderRadius: 6,
            border: '1px solid rgba(24,93,232,0.4)',
            background: 'rgba(24,93,232,0.12)',
            color: '#8ab4ff',
            fontSize: 12,
            fontWeight: 800,
            textDecoration: 'none',
          }}
        >
          Volver al chat
        </a>
      </section>
    </main>
  );
}
