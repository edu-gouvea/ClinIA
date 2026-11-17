'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { Popover } from './ui';

export type FilterChipOption = {
  /** The value written to the URL; the empty string is the "all" option. */
  id: string;
  label: string;
  sub?: string;
  /** Leading element, e.g. a professional avatar. */
  leading?: ReactNode;
};

/** The product's single-choice filter. Empty: a dashed "+ Nome" chip. Applied: a solid
 * "Nome: valor" chip with its own "×". The choices open as a listbox in a `Popover`
 * (a modal sheet below 768 px): ↑/↓/Home/End move, Enter or Space choose. The first
 * option is the "all" option and is separated from the rest. */
export function FilterChip({ name, value, valueLabel, options, onChange, removeLabel }: {
  name: string;
  value: string;
  /** Text of the applied value (may differ from the option label, e.g. a removed record). */
  valueLabel: string;
  options: FilterChipOption[];
  onChange: (value: string) => void;
  removeLabel: string;
}) {
  const applied = !!value;
  const filterBy = `Filtrar por ${name.toLocaleLowerCase('pt-BR')}`;
  function onKey(event: KeyboardEvent<HTMLDivElement>, close: () => void) {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]'));
    const index = items.indexOf(document.activeElement as HTMLElement);
    const target = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: items.length - 1 }[event.key];
    if (target !== undefined) {
      event.preventDefault();
      items[Math.max(0, Math.min(items.length - 1, target))]?.focus();
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && index >= 0) {
      event.preventDefault();
      onChange(items[index].dataset.value ?? '');
      close();
    }
  }
  return <div className={`choice-chip-group${applied ? ' is-applied' : ''}`}>
    <Popover label={filterBy} triggerClassName="choice-chip" className="choice-chip-popover"
      triggerLabel={applied ? `${name}: ${valueLabel}` : filterBy}
      triggerContent={applied
        ? <><span className="choice-chip-prefix">{name}:</span> <span className="choice-chip-value">{valueLabel}</span></>
        : <><Plus size={14} aria-hidden="true" />{name}</>}>
      {close => <div role="listbox" aria-label={name} className="choice-chip-options" onKeyDown={event => onKey(event, close)}>
        {options.map((option, index) => <div key={option.id || 'all'} role="option" tabIndex={(value ? option.id === value : index === 0) ? 0 : -1}
          aria-selected={option.id === value} data-value={option.id} className={`choice-chip-option${index === 0 ? ' is-all' : ''}`}
          onClick={() => { onChange(option.id); close(); }}>
          <span className="choice-chip-check" aria-hidden="true">{option.id === value && <Check size={14} />}</span>
          {option.leading}
          <span className="choice-chip-text"><span>{option.label}</span>{option.sub && <small>{option.sub}</small>}</span>
        </div>)}
      </div>}
    </Popover>
    {applied && <button type="button" className="choice-chip-remove" aria-label={removeLabel} onClick={() => onChange('')}><X size={14} aria-hidden="true" /></button>}
  </div>;
}
