import { Suspense } from 'react';
import { Agenda } from '@/features/agenda';
export default function Page() { return <Suspense fallback={<p role="status" className="app-loading">Carregando agenda…</p>}><Agenda /></Suspense>; }
