import { NextResponse } from 'next/server';

// El flujo de contraseña compartida del CRM fue eliminado (2026-07-17): el
// acceso ahora es por rol owner/admin en tenant_members (ver lib/crm-access).
export async function POST() {
  return NextResponse.json(
    { error: 'El acceso al CRM ahora es por rol de dueño. Ingresá con la cuenta owner.' },
    { status: 410 },
  );
}
