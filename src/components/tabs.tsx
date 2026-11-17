'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export type TabItem<K extends string> = {
  key: K;
  label: ReactNode;
  /** Accessible name when the visible label is not enough (e.g. "Pendentes, 3"). */
  ariaLabel?: string;
};

/** The single tab list of the product (WAI-ARIA tabs with automatic activation):
 * roving tabindex, ←/→ wrap around, Home/End jump, and the newly selected tab keeps
 * the focus. Ids follow `${idPrefix}-tab-${key}`; the panel the host renders must use
 * `tabPanelProps`. `variant` only changes the look: `underline` for page sections,
 * `pill` for a compact switch inside a panel header. */
export function Tabs<K extends string>({ items, value, onChange, label, idPrefix, variant = 'underline', className = '', panelId }: {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
  idPrefix: string;
  variant?: 'underline' | 'pill';
  className?: string;
  /** Overrides the controlled element, for lists that share one panel. */
  panelId?: string;
}) {
  const list = useRef<HTMLDivElement>(null);
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = items.findIndex(item => item.key === value);
    const last = items.length - 1;
    const target = event.key === 'ArrowRight' ? (index + 1) % items.length
      : event.key === 'ArrowLeft' ? (index + last) % items.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? last : -1;
    if (target < 0) return;
    event.preventDefault();
    const next = items[target].key;
    onChange(next);
    list.current?.querySelector<HTMLElement>(`#${CSS.escape(tabId(idPrefix, next))}`)?.focus();
  }
  return <div ref={list} role="tablist" aria-label={label} className={`tabs tabs-${variant} ${className}`}>
    {items.map(item => {
      const selected = item.key === value;
      return <button key={item.key} type="button" role="tab" id={tabId(idPrefix, item.key)} data-tab={item.key}
        aria-selected={selected} aria-controls={panelId ?? tabPanelId(idPrefix, item.key)} aria-label={item.ariaLabel}
        tabIndex={selected ? 0 : -1} onClick={() => onChange(item.key)} onKeyDown={onKeyDown}>{item.label}</button>;
    })}
  </div>;
}

const tabId = (prefix: string, key: string) => `${prefix}-tab-${key}`;
const tabPanelId = (prefix: string, key: string) => `${prefix}-panel-${key}`;

/** Spread on the element that shows the selected tab's content. */
export const tabPanelProps = (idPrefix: string, key: string) => ({
  role: 'tabpanel' as const,
  id: tabPanelId(idPrefix, key),
  'aria-labelledby': tabId(idPrefix, key),
});
