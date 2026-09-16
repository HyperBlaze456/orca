/** A `{"id", "error": {...}}` reply from `trivium service`. The slug is the contract's own. */
export class TriviumServiceError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'TriviumServiceError'
  }
}

export function isTriviumServiceError(error: unknown): error is TriviumServiceError {
  return error instanceof TriviumServiceError
}

export type TriviumServiceReady = {
  protocol: number
  version: string
}

export type TriviumServiceReply =
  | { kind: 'result'; id: string | number; result: unknown }
  | { kind: 'error'; id: string | number; error: TriviumServiceError }
  /** Correlatable but unusable: the caller is failed now rather than at its deadline. */
  | { kind: 'malformed'; id: string | number; line: string }
  | { kind: 'unrecognized' }

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** The `ready` event the service emits before it will answer anything. */
export function parseTriviumReadyLine(record: unknown): TriviumServiceReady | null {
  const frame = asRecord(record)
  if (!frame || frame.event !== 'ready') {
    return null
  }
  const protocol = frame.protocol
  const version = frame.version
  return {
    protocol: typeof protocol === 'number' ? protocol : 0,
    version: typeof version === 'string' ? version : ''
  }
}

export function parseTriviumReply(record: unknown, line = ''): TriviumServiceReply {
  const frame = asRecord(record)
  const id = frame?.id
  if (!frame || (typeof id !== 'string' && typeof id !== 'number')) {
    return { kind: 'unrecognized' }
  }
  const error = asRecord(frame.error)
  if (error) {
    const code = typeof error.code === 'string' ? error.code : 'unknown'
    const message = typeof error.message === 'string' ? error.message : code
    return { kind: 'error', id, error: new TriviumServiceError(code, message) }
  }
  if ('result' in frame) {
    return { kind: 'result', id, result: frame.result }
  }
  // An id with neither `result` nor `error` is off-contract, but it still names
  // the caller waiting on it, so fail that one instead of letting it hang.
  return { kind: 'malformed', id, line }
}
