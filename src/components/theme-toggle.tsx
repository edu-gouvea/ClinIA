'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';

const storageKey = 'clinia.theme';
const changeEvent = 'clinia:theme';
const snapshot = () => document.documentElement.dataset.theme === 'dark';
const serverSnapshot = () => false;

function subscribe(notify: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const applyPreference = () => {
    let preference: string | null = null;
    try { preference = localStorage.getItem(storageKey); } catch { /* The control also works without storage. */ }
    document.documentElement.dataset.theme = preference === 'dark' || (preference !== 'light' && media.matches) ? 'dark' : 'light';
    notify();
  };
  const storageChanged = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) applyPreference(); };
  window.addEventListener(changeEvent, notify);
  window.addEventListener('storage', storageChanged);
  media.addEventListener('change', applyPreference);
  return () => {
    window.removeEventListener(changeEvent, notify);
    window.removeEventListener('storage', storageChanged);
    media.removeEventListener('change', applyPreference);
  };
}

/** Dark-theme switch: the name stays constant ("Tema escuro") and `aria-pressed`
 * carries the state, so assistive technology hears one stable control. */
export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const label = 'Tema escuro';
  function toggle() {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(storageKey, next); } catch { /* Keep the preference for this session. */ }
    window.dispatchEvent(new Event(changeEvent));
  }
  return <button type="button" className="sidebar-item theme-toggle" aria-label={label} title={dark ? 'Tema escuro ativo' : 'Tema claro ativo'} aria-pressed={dark} onClick={toggle}>
    {dark ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />}
    <span className="sidebar-label">{label}</span>
    <span className="theme-switch" aria-hidden="true"><span /></span>
  </button>;
}
