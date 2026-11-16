'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useDemo } from '@/components/demo-provider';
import type { Patient } from '@/lib/types';
import { PatientDetail } from './patients/patient-detail';
import { PatientForm } from './patients/patient-form';
import { PatientList } from './patients/patient-list';

/** `/gestao/pacientes`: the list, or the patient record when `id` matches a patient.
 * Query params — list: `q`, `insurance`, `view`, `sort`, `order`, `page`; record: `id`,
 * `tab`, `when`, `professional`, `page`, `appointment`, `listPage`; both: `context`. */
export function Patients() {
  const { state } = useDemo(); const params = useSearchParams();
  const selected = state.patients.find((p) => p.id === params.get('id'));
  const [form, setForm] = useState<{ patient?: Patient } | null>(null);
  return <>
    {selected ? <PatientDetail key={selected.id} patient={selected} onEdit={() => setForm({ patient: selected })} /> : <PatientList onCreate={() => setForm({})} />}
    {form && <PatientForm patient={form.patient} onClose={() => setForm(null)} />}
  </>;
}
