import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { breakpointQuery, breakpoints } from '../src/lib/breakpoints';

const allowed = new Set(Object.values(breakpoints).flatMap(value => [value, value - 1]));

test('consultas de mídia do shell, de Conversas e de Pacientes usam apenas a escala única de breakpoints', () => {
  for (const file of ['src/app/shell.css', 'src/app/conversations.css', 'src/app/patients.css', 'src/app/booking.css']) {
    const css = readFileSync(file, 'utf8');
    const queries = css.match(/@media[^{]+/g) ?? [];
    const widths = queries.flatMap(query => [...query.matchAll(/(?:min|max)-width:\s*(\d+)px/g)].map(match => Number(match[1])));
    assert.ok(widths.length > 0, file);
    for (const width of widths) assert.ok(allowed.has(width), `${file}: ${width}px fora da escala`);
  }
});

test('consulta nomeada reproduz o valor da escala', () => {
  assert.equal(breakpointQuery('md'), '(min-width: 768px)');
  assert.deepEqual(Object.values(breakpoints), [640, 768, 1024, 1280, 1536]);
});
