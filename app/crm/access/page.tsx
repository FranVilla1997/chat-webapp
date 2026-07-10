import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getCrmAccessPassword, hasCrmAccess } from '@/lib/crm-access';

export const dynamic = 'force-dynamic';

const MONO = `'SF Mono', 'Consolas', 'Liberation Mono', monospace`;

function safeNextPath(value?: string) {
  const next = String(value ?? '/crm');
  if (!next.startsWith('/crm')) return '/crm';
  if (next.startsWith('//')) return '/crm';
  return next;
}

function errorMessage(error?: string) {
  if (error === 'invalid') return 'La clave ingresada no es correcta.';
  if (error === 'missing_config') return 'Falta configurar CRM_ACCESS_PASSWORD en el entorno.';
  return '';
}

export default async function CrmAccessPage({
  searchParams,
}: {
  searchParams?: { next?: string; error?: string };
}) {
  const session = await getSession();
  if (!session) redirect('/login?next=/crm/access');

  const next = safeNextPath(searchParams?.next);
  if (hasCrmAccess(session.user.id)) redirect(next);

  const configured = Boolean(getCrmAccessPassword());
  const message = errorMessage(searchParams?.error);

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
          width: 'min(100%, 420px)',
          border: '1px solid #1e1e2a',
          background: '#0a0a0f',
          borderRadius: 12,
          padding: 28,
          boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 26 }}>
          <Image
            src="/logo/scala-logo.svg"
            alt="SCALA"
            width={104}
            height={14}
            priority
            style={{ filter: 'brightness(0) invert(1)', opacity: 0.92 }}
          />
          <span style={{ height: 24, width: 1, background: '#1e1e2a' }} />
          <span
            style={{
              color: '#8ab4ff',
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            CRM
          </span>
        </div>

        <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.05 }}>
          Acceso de duenos
        </h1>
        <p style={{ margin: '10px 0 22px', color: '#848494', fontSize: 13, lineHeight: 1.5 }}>
          Ingresá la clave interna para abrir el centro de control comercial.
        </p>

        {message ? (
          <div
            style={{
              border: `1px solid ${searchParams?.error === 'missing_config' ? 'rgba(245,158,11,0.32)' : 'rgba(239,68,68,0.32)'}`,
              background:
                searchParams?.error === 'missing_config'
                  ? 'rgba(245,158,11,0.08)'
                  : 'rgba(239,68,68,0.08)',
              color: searchParams?.error === 'missing_config' ? '#f59e0b' : '#ff8a8a',
              borderRadius: 8,
              padding: '10px 12px',
              marginBottom: 14,
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            {message}
          </div>
        ) : null}

        <form action="/api/crm/access" method="post">
          <input type="hidden" name="next" value={next} />
          <label
            htmlFor="crm-password"
            style={{
              display: 'block',
              color: '#a8a8b3',
              fontSize: 12,
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            Clave de acceso
          </label>
          <input
            id="crm-password"
            name="password"
            type="password"
            autoFocus
            disabled={!configured}
            placeholder="Ingresá la clave"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              border: '1px solid #2a2a38',
              background: '#12121a',
              color: '#f2f2f4',
              borderRadius: 8,
              padding: '12px 13px',
              fontSize: 14,
              outline: 'none',
              marginBottom: 14,
            }}
          />
          <button
            type="submit"
            disabled={!configured}
            style={{
              width: '100%',
              border: '1px solid rgba(24,93,232,0.45)',
              background: configured ? '#185de8' : '#1e1e2a',
              color: configured ? '#fff' : '#666676',
              borderRadius: 8,
              padding: '12px 14px',
              fontSize: 13,
              fontWeight: 900,
              cursor: configured ? 'pointer' : 'not-allowed',
            }}
          >
            Entrar al CRM
          </button>
        </form>

        <p style={{ margin: '16px 0 0', color: '#505060', fontSize: 11, lineHeight: 1.45 }}>
          El acceso queda habilitado sólo para esta sesión.
        </p>
      </section>
    </main>
  );
}
