import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  CRM_ACCESS_COOKIE,
  createCrmAccessToken,
  crmAccessCookieOptions,
  getCrmAccessPassword,
  passwordMatchesCrmAccess,
} from '@/lib/crm-access';

function safeNextPath(value: FormDataEntryValue | null) {
  const next = String(value ?? '/crm');
  if (!next.startsWith('/crm')) return '/crm';
  if (next.startsWith('//')) return '/crm';
  return next;
}

function redirectToAccess(req: NextRequest, error: string, next: string) {
  const url = new URL('/crm/access', req.url);
  url.searchParams.set('error', error);
  url.searchParams.set('next', next);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', '/crm/access');
    return NextResponse.redirect(loginUrl, { status: 303 });
  }

  const form = await req.formData();
  const next = safeNextPath(form.get('next'));
  const password = String(form.get('password') ?? '');

  if (!getCrmAccessPassword()) {
    return redirectToAccess(req, 'missing_config', next);
  }

  if (!passwordMatchesCrmAccess(password)) {
    return redirectToAccess(req, 'invalid', next);
  }

  const response = NextResponse.redirect(new URL(next, req.url), { status: 303 });
  response.cookies.set(
    CRM_ACCESS_COOKIE,
    createCrmAccessToken(session.user.id),
    crmAccessCookieOptions(),
  );
  return response;
}

export async function DELETE(req: NextRequest) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(CRM_ACCESS_COOKIE, '', {
    ...crmAccessCookieOptions(),
    maxAge: 0,
  });
  return response;
}
