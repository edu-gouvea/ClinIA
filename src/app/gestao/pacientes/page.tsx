import { Suspense } from 'react';
import { Patients } from '@/features/patients';
export default function Page() { return <Suspense fallback={<p>Carregando pacientes…</p>}><Patients /></Suspense>; }
