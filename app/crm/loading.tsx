import Image from 'next/image';

const MONO = `'SF Mono', 'Consolas', 'Liberation Mono', monospace`;

export default function CrmLoading() {
  return (
    <main
      style={{
        minHeight: '100svh',
        display: 'grid',
        placeItems: 'center',
        background: '#050508',
        color: '#f2f2f4',
        padding: 24,
      }}
    >
      <section
        style={{
          width: 'min(92vw, 430px)',
          border: '1px solid #1e1e2a',
          background: '#0a0a0f',
          borderRadius: 12,
          padding: 28,
          textAlign: 'center',
          boxShadow: '0 24px 90px rgba(0,0,0,0.55)',
        }}
      >
        <Image
          src="/logo/scala-logo.svg"
          alt="SCALA"
          width={104}
          height={14}
          priority
          style={{ filter: 'brightness(0) invert(1)', opacity: 0.92, marginBottom: 22 }}
        />
        <span
          style={{
            width: 34,
            height: 34,
            display: 'inline-block',
            borderRadius: '50%',
            border: '3px solid rgba(24,93,232,0.18)',
            borderTopColor: '#185de8',
            animation: 'crmLoadingSpin .7s linear infinite',
            marginBottom: 16,
          }}
        />
        <p
          style={{
            margin: '0 0 8px',
            color: '#8ab4ff',
            fontFamily: MONO,
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          CRM
        </p>
        <h1 style={{ margin: 0, color: '#f2f2f4', fontSize: 20 }}>
          Cargando centro de control
        </h1>
        <p style={{ margin: '8px 0 0', color: '#848494', fontSize: 12 }}>
          Preparando ventas, mensajes y proyecciones.
        </p>
      </section>
      <style>{`
        @keyframes crmLoadingSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
}
