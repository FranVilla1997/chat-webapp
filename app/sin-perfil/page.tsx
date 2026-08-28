import Image from 'next/image';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { CrmLogoutButton } from '@/components/crm/CrmLogoutButton';

// Destino para una sesión válida que no tiene perfil de vendedor asociado.
//
// Antes estos casos se mandaban a /login, pero el middleware rebota /login a /
// cuando hay sesión, y / vuelve a mandar a /chats: el usuario quedaba en un
// ERR_TOO_MANY_REDIRECTS del que no podía salir ni recargando. Esta pantalla
// corta el ciclo: es un destino final que dice qué pasa y permite salir.
export default async function SinPerfilPage() {
  const supabase = createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  // Sin sesión no hay nada que explicar: el login es el lugar correcto y no
  // hay rebote posible porque el middleware sólo redirige /login CON sesión.
  if (!session) redirect('/login');

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100svh',
      alignItems: 'center', justifyContent: 'center',
      padding: '0 24px', textAlign: 'center', gap: 18,
    }}>
      <Image src="/logo/scala-logo.svg" alt="SCALA" width={100} height={13} />

      <div style={{ maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h1 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: 0 }}>
          Tu usuario no tiene perfil de vendedor
        </h1>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-3)', margin: 0 }}>
          Iniciaste sesión correctamente, pero esta cuenta no está asociada a un
          perfil de vendedor, así que no hay bandeja que mostrarte.
        </p>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text-3)', margin: 0 }}>
          Avisale al equipo para que revise tu alta. Si tenés otra cuenta,
          cerrá sesión e ingresá con esa.
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, opacity: 0.7 }}>
          {session.user.email}
        </p>
      </div>

      <CrmLogoutButton />
    </div>
  );
}
