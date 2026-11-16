import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Suspense } from 'react';
import { themeBootstrap } from '@/lib/theme';
import { DemoProvider } from '@/components/demo-provider';
import { AppShell } from '@/components/app-shell';
import './globals.css';

// Variable Inter, self-hosted by next/font and exposed as --font-sans (see tokens.css).
const inter = Inter({ subsets: ['latin', 'latin-ext'], display: 'swap', variable: '--font-sans' });

export const metadata: Metadata = { title: 'ClinIA · Cuidado que conecta', description: 'CRM administrativo para clínicas. Demonstração local com dados fictícios.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR" className={inter.variable} suppressHydrationWarning><head><script id="clinia-theme" dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head><body data-density="standard"><DemoProvider><Suspense fallback={<div className="app-loading">Preparando sua clínica…</div>}><AppShell>{children}</AppShell></Suspense></DemoProvider></body></html>;
}
