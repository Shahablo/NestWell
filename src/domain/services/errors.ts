/**
 * DomainError: thrown by a service when a command is invalid for the current state
 * (for example submitting a check-in that is not open, or closing an indicated episode
 * without a destination, FR-39). The store lets it propagate; nothing is appended.
 */
export class DomainError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = 'DomainError';
    this.code = code;
  }
}

export function assertDomain(condition: unknown, code: string, message?: string): asserts condition {
  if (!condition) throw new DomainError(code, message);
}
