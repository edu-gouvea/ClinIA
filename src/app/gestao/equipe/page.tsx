import { Suspense } from 'react';
import { Team } from '@/features/team/team';
export default function Page() { return <Suspense fallback={<p role="status" className="app-loading">Carregando equipe…</p>}><Team /></Suspense>; }
