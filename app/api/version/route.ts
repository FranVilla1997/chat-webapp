import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Devuelve el sello de build del deploy que está sirviendo ahora. El cliente
// compara contra el sello inlineado en su bundle para detectar versión nueva.
export async function GET() {
  return NextResponse.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
