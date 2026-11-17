/** The error contract between the command layer and the screens. Today the local demo
 * service throws it; the HTTP adapter will build the same object from the API response,
 * so screens never parse message text to decide what to do.
 *
 * `code` says what kind of failure it is (and whether retrying can help), `field` names
 * the input the message is about, and `message` is final pt-BR copy for the person. */
export type ErrorCode =
  /** The input breaks a rule; fix the field and resubmit. */
  | 'validation'
  /** The record no longer exists (deleted, or never existed). */
  | 'not_found'
  /** Someone/something else holds the slot or the record (schedule overlap, duplicate). */
  | 'conflict'
  /** The action belongs to another person (e.g. a conversation assigned to someone else). */
  | 'forbidden'
  /** The record is in a state that does not allow this transition. */
  | 'invalid_state'
  /** A temporary failure; the same request can be retried as is. */
  | 'unavailable';

export class CommandError extends Error {
  readonly code: ErrorCode;
  readonly field?: string;
  constructor(code: ErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'CommandError';
    this.code = code;
    this.field = field;
  }
  /** Whether resending the same request can succeed without changes. */
  get retryable(): boolean { return this.code === 'unavailable'; }
}

export const isCommandError = (value: unknown): value is CommandError => value instanceof CommandError;

/** HTTP status the API should answer for each code (see docs/INTEGRACAO.md). The database
 * proposal already maps exclusion violations (23P01) to 409 and FK errors (23503) to 422. */
export const httpStatus: Record<ErrorCode, number> = {
  validation: 422,
  not_found: 404,
  conflict: 409,
  forbidden: 403,
  invalid_state: 409,
  unavailable: 503,
};

/** Rebuild the error from an API body `{ code, message, field? }` (unknown codes fall back
 * to `unavailable`, which keeps the form and offers a retry). */
export function commandErrorFrom(body: unknown): CommandError {
  const record = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
  const code = typeof record.code === 'string' && record.code in httpStatus ? record.code as ErrorCode : 'unavailable';
  const message = typeof record.message === 'string' && record.message.trim() ? record.message : 'Não foi possível concluir. Tente novamente.';
  return new CommandError(code, message, typeof record.field === 'string' ? record.field : undefined);
}
