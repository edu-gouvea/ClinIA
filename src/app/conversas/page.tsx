import { Suspense } from 'react';
import { Conversations } from '@/features/conversations';

export default function ConversationsPage() {
  return <Suspense fallback={<p role="status" className="app-loading">Carregando conversas…</p>}><Conversations /></Suspense>;
}
