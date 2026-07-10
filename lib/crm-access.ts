import crypto from 'crypto';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from './supabase-server';

export const CRM_ACCESS_COOKIE = 'scala_crm_access';
const COOKIE_MAX_AGE_SECONDS = 8 * 60 * 60;

type CrmAccessPayload = {
  userId: string;
  exp: number;
};

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function crmSecret() {
  return (
    process.env.CRM_ACCESS_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.CRM_ACCESS_PASSWORD ||
    ''
  );
}

export function getCrmAccessPassword() {
  return process.env.CRM_ACCESS_PASSWORD?.trim() ?? '';
}

function signPayload(payload: string) {
  const secret = crmSecret();
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function timingSafeEqual(a: string, b: string) {
  const left = crypto.createHash('sha256').update(a).digest();
  const right = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(left, right);
}

export function passwordMatchesCrmAccess(input: string) {
  const expected = getCrmAccessPassword();
  if (!expected) return false;
  return timingSafeEqual(String(input ?? ''), expected);
}

export function createCrmAccessToken(userId: string) {
  const payload: CrmAccessPayload = {
    userId,
    exp: Date.now() + COOKIE_MAX_AGE_SECONDS * 1000,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  if (!signature) return '';
  return `${encodedPayload}.${signature}`;
}

export function hasCrmAccess(userId: string) {
  const token = cookies().get(CRM_ACCESS_COOKIE)?.value;
  if (!token || !userId) return false;

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return false;

  const expectedSignature = signPayload(encodedPayload);
  if (!expectedSignature || !timingSafeEqual(signature, expectedSignature)) return false;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as CrmAccessPayload;
    return payload.userId === userId && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export function crmAccessCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  };
}

export async function getCrmAccessState() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return {
    session,
    allowed: session ? hasCrmAccess(session.user.id) : false,
  };
}
