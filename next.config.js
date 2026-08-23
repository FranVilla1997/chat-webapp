/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Sello de build: queda inlineado en el bundle del cliente Y en /api/version
  // del mismo deploy. Una pestaña vieja compara su sello contra el del server
  // y muestra el banner de "versión nueva" cuando difieren.
  // OJO: tiene que ser estable dentro del deploy — Vercel evalúa este archivo
  // una vez por compilación (cliente/servidor), así que Date.now() generaba
  // dos sellos distintos en el MISMO deploy y el banner quedaba en loop.
  // VERCEL_URL es la URL única del deployment: idéntica en todas las pasadas.
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_URL || 'dev',
  },
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

module.exports = nextConfig;
