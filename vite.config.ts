import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// The document never leaves the device, and this policy makes the browser
// enforce it: the page may only load its own files and may not send requests
// anywhere else. Only added to production builds, because the dev server
// injects inline scripts for hot reload.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const contentSecurityPolicy = (): Plugin => ({
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
      injectTo: 'head-prepend',
    },
  ],
});

export default defineConfig({
  base: './',
  plugins: [react(), contentSecurityPolicy()],
  server: { port: 5173 },
});
