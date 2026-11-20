import type { StackedDatum, StackedSeries } from '@/components/stacked-bar-chart';
import { monthShortOf, weekdayOf, weekdaysLong, weekdaysShort } from './date';
import { dailyBreakdown } from './management-analysis';
import type { DemoState, Period } from './types';

const dayOf = (date: string) => date.slice(8, 10);

/** Columns of the "Consultas por dia" chart (Início and Visão gerencial): one per day
 * from `dailyBreakdown`, "Hoje" highlighted, sparse labels in the 30-day view. */
export function dailyChartData(state: DemoState, period: Period, days: number, professionalId: string, specialty: string): StackedDatum[] {
  const data: StackedDatum[] = dailyBreakdown(state, { professionalId, specialty }, period).slice(0, 366).map((day, index) => {
    const date = day.date; const isToday = date === state.referenceDate;
    return {
      id: date, highlight: isToday, label: isToday ? 'Hoje' : `${weekdaysShort[weekdayOf(date)]} ${dayOf(date)}`, shortLabel: isToday ? 'Hoje' : dayOf(date),
      fullLabel: `${weekdaysLong[weekdayOf(date)]}, ${dayOf(date)} ${monthShortOf(date)}`,
      showLabel: days < 30 || isToday || index % 5 === 0,
      values: { completed: day.completed, missed: day.missed, cancelled: day.cancelled, planned: day.planned },
    };
  });
  // A label right before "Hoje" would collide with it in the 30-day view.
  if (days >= 30) data.forEach((datum, index) => { if (index >= data.length - 3 && !datum.highlight) datum.showLabel = false; });
  return data;
}

/** The four outcome series, in stacking order, shared by every appointment chart. */
export const chartSeries: StackedSeries[] = [
  { key: 'completed', label: 'Realizadas', unit: 'realizadas', color: 'var(--data-realizadas)' },
  { key: 'missed', label: 'Faltas', unit: 'faltas', color: 'var(--data-faltas)' },
  { key: 'cancelled', label: 'Canceladas', unit: 'canceladas', color: 'var(--data-canceladas)' },
  { key: 'planned', label: 'Em aberto', unit: 'em aberto', color: 'var(--data-em-aberto)', outlined: true },
];
