import { Suspense } from 'react';
import { Team } from '@/features/team';
export default function Page() { return <Suspense fallback={<p>Carregando equipe…</p>}><Team /></Suspense>; }
