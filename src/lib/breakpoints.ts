/** Single breakpoint scale for CSS and JS. CSS media queries cannot read custom
 * properties, so the shell/conversation stylesheets use these literal values and
 * `tests/breakpoints.test.ts` fails if they drift from this list. */
export const breakpoints = { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 } as const;
export type Breakpoint = keyof typeof breakpoints;

/** `min-width` query for a named breakpoint, e.g. `breakpointQuery('md')`. */
export const breakpointQuery = (name: Breakpoint) => `(min-width: ${breakpoints[name]}px)`;
