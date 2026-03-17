/**
 * Exponential backoff retry wrapper for Stripe SDK calls.
 *
 * Wraps individual Stripe API calls so that transient connection failures
 * (timeouts, network blips) are retried without restarting the entire
 * multi-step invoice flow from scratch.
 */

interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts?: number
  /** Base delay in ms before first retry. Default: 1000 */
  baseDelayMs?: number
  /** Label for log messages. Default: 'stripe-call' */
  label?: string
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  label: 'stripe-call',
}

/** Error types from Stripe that are safe to retry (transient). */
const RETRYABLE_TYPES = new Set([
  'StripeConnectionError',
  'StripeAPIError', // 500s from Stripe
  'StripeRateLimitError',
])

function isRetryable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false

  // Stripe SDK errors have a `type` field
  if ('type' in err) {
    return RETRYABLE_TYPES.has((err as { type: string }).type)
  }

  // Generic network errors (e.g. ECONNRESET, ETIMEDOUT)
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    return (
      msg.includes('econnreset') ||
      msg.includes('etimedout') ||
      msg.includes('enotfound') ||
      msg.includes('socket hang up') ||
      msg.includes('network') ||
      msg.includes('retried')
    )
  }

  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Execute a Stripe SDK call with exponential backoff + jitter.
 *
 * @example
 * const customer = await withStripeRetry(
 *   () => stripe.customers.list({ email, limit: 1 }),
 *   { label: 'customers.list' }
 * )
 */
export async function withStripeRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  let lastError: unknown

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err

      if (attempt === opts.maxAttempts || !isRetryable(err)) {
        throw err
      }

      // Exponential backoff: 1s → 2s → 4s, with ±25% jitter
      const delay = opts.baseDelayMs * Math.pow(2, attempt - 1)
      const jitter = delay * 0.25 * (Math.random() * 2 - 1) // ±25%
      const waitMs = Math.round(delay + jitter)

      console.warn(
        `[${opts.label}] Attempt ${attempt}/${opts.maxAttempts} failed, retrying in ${waitMs}ms:`,
        err instanceof Error ? err.message : err
      )

      await sleep(waitMs)
    }
  }

  // Should not reach here, but TypeScript needs it
  throw lastError
}
