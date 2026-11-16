'use client';
import type { CSSProperties } from 'react';
import { Avatar } from '@/components/ui';
import { professionalAvatarColors } from '@/lib/agenda-presentation';
import type { Professional } from '@/lib/types';

/** The professional's colour lives only here (the event colour means situation).
 * Both theme palettes are precomputed with ≥4.5:1 initials; CSS picks one. */
export function ProfessionalAvatar({ professional, size }: { professional: Pick<Professional, 'name' | 'color'>; size: 22 | 24 | 26 | 32 | 34 }) {
  const light = professionalAvatarColors(professional.color, 'light');
  const dark = professionalAvatarColors(professional.color, 'dark');
  const style = { '--pa-bg': light.background, '--pa-ink': light.ink, '--pa-bg-dark': dark.background, '--pa-ink-dark': dark.ink } as CSSProperties;
  return <Avatar name={professional.name} size="sm" className={`pro-avatar pro-avatar-${size}`} style={style} />;
}
