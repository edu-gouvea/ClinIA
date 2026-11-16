'use client';

import { Clock, MessageCircle, Repeat, XCircle, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui';
import type { Pendency, PendencyIcon } from '@/lib/patient-presentation';

export const pendencyIcons: Record<PendencyIcon, LucideIcon> = { repeat: Repeat, message: MessageCircle, clock: Clock, 'x-circle': XCircle };

export function PendencyBadge({ pendency }: { pendency: Pendency }) {
  const Icon = pendencyIcons[pendency.icon];
  return <Badge tone={pendency.tone}><Icon size={12} aria-hidden="true" />{pendency.label}</Badge>;
}

type Params = { toString(): string };
/** List params travel with the detail so "Pacientes" (and the browser back) restore
 * them. The list page is carried as `listPage` because the detail's Consultas tab
 * paginates with its own `page`. */
const DETAIL_KEYS = ['id', 'tab', 'when', 'professional', 'page', 'appointment'];
export function detailHref(params: Params, id: string): string {
  const next = new URLSearchParams(params.toString());
  const page = next.get('page');
  DETAIL_KEYS.forEach(key => next.delete(key));
  if (page) next.set('listPage', page);
  const query = new URLSearchParams({ id });
  next.forEach((value, key) => query.set(key, value));
  return `/gestao/pacientes?${query}`;
}
export function listHref(params: Params): string {
  const next = new URLSearchParams(params.toString());
  const page = next.get('listPage');
  [...DETAIL_KEYS, 'listPage'].forEach(key => next.delete(key));
  if (page) next.set('page', page);
  return `/gestao/pacientes${next.size ? `?${next}` : ''}`;
}
export const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
