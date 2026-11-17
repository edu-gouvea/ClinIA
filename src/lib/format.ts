/** Shared pt-BR text and number formatting. Screens import from here so the same
 * value never reads differently in two places. */

/** "1 consulta", "1.250 consultas". */
export const plural = (count: number, one: string, many: string) => `${count.toLocaleString('pt-BR')} ${count === 1 ? one : many}`;

/** A 0–100 rate with one decimal ("12,5%"); `null` means there is no denominator. */
export const formatRate = (value: number | null) => value === null ? 'Sem dados' : `${value.toFixed(1).replace('.', ',')}%`;

/** Up to one decimal, pt-BR separators ("7,5"). */
export const formatDecimal = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

export const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);

/** Accent- and case-insensitive form for searching. */
export const normalizeText = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Digits of a Brazilian phone, without the country code. */
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length > 11 && digits.startsWith('55') ? digits.slice(2) : digits;
}

/** The message of a thrown error, or `fallback` for anything else. */
export const errorMessage = (cause: unknown, fallback = 'Não foi possível concluir. Tente novamente.') => cause instanceof Error ? cause.message : fallback;
