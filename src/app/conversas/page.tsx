import { Suspense } from 'react';
import { Conversations } from '@/features/conversations';

export default function ConversationsPage() {
  return <Suspense fallback={<p role="status" className="p-8 text-sm text-[var(--muted)]">Carregando conversas…</p>}><Conversations /></Suspense>;
}
