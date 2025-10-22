import { Elysia } from 'elysia'
import { CUSTOM_HEADERS } from './constants'

const DEFAULT_LIMITS = {
  auth: { limit: 5, windowMs: 15 * 60 * 1000 }, // 5 X 15 min
  api: { limit: 100, windowMs: 60 * 1000 }, // 100 X 1 min
  dashboard: { limit: 300, windowMs: 60 * 1000 }, // 300 X 1 min
  upload: { limit: 10, windowMs: 60 * 1000 }, // 10 X 1 min
  default: { limit: 60, windowMs: 60 * 1000 } // 60 X 1 min
}

interface RateLimitRecord {
  count: number
  resetTime: number
  firstRequest: number
}

interface RateLimitConfig {
  limit: number
  windowMs: number
  keyGenerator?: (request: any) => string
  skipSuccessfulRequests?: boolean
  skipFailedRequests?: boolean
  headers?: boolean
}

class InMemoryRateLimiter {
  private store = new Map<string, RateLimitRecord>()
  private cleanupInterval: Timer

  constructor(private cleanupIntervalMs = 5 * 60 * 1000) {
    this.cleanupInterval = setInterval(
      () => this.cleanup(),
      this.cleanupIntervalMs
    )
  }

  private cleanup() {
    const now = Date.now()
    let cleaned = 0

    for (const [key, record] of this.store) {
      if (now > record.resetTime) {
        this.store.delete(key)
        cleaned++
      }
    }

    if (cleaned > 0) {
      console.log(`Rate limiter: Cleaned ${cleaned} expired entries`)
    }
  }

  check(
    key: string,
    limit: number,
    windowMs: number
  ): {
    allowed: boolean
    count: number
    remaining: number
    resetTime: number
    retryAfter?: number
  } {
    const now = Date.now()
    const record = this.store.get(key)

    if (!record || now > record.resetTime) {
      const newRecord: RateLimitRecord = {
        count: 1,
        resetTime: now + windowMs,
        firstRequest: now
      }
      this.store.set(key, newRecord)

      return {
        allowed: true,
        count: 1,
        remaining: limit - 1,
        resetTime: newRecord.resetTime
      }
    }

    if (record.count >= limit) {
      return {
        allowed: false,
        count: record.count,
        remaining: 0,
        resetTime: record.resetTime,
        retryAfter: Math.ceil((record.resetTime - now) / 1000)
      }
    }

    record.count++

    return {
      allowed: true,
      count: record.count,
      remaining: limit - record.count,
      resetTime: record.resetTime
    }
  }

  getStats() {
    return {
      totalKeys: this.store.size,
      entries: Array.from(this.store.entries()).map(([key, record]) => ({
        key,
        count: record.count,
        resetTime: new Date(record.resetTime).toISOString(),
        remaining: Math.max(
          0,
          Math.ceil((record.resetTime - Date.now()) / 1000)
        )
      }))
    }
  }

  reset(key: string) {
    return this.store.delete(key)
  }

  destroy() {
    clearInterval(this.cleanupInterval)
    this.store.clear()
  }
}

const rateLimiter = new InMemoryRateLimiter()

export const rateLimit = new Elysia({ name: 'rate-limit' })
  .macro({
    rateLimit(
      scopeOrConfig:
        | 'auth'
        | 'api'
        | 'dashboard'
        | 'upload'
        | 'default'
        | RateLimitConfig,
      config?: Partial<RateLimitConfig>
    ) {
      return {
        beforeHandle: ({ request, set }) => {
          let finalConfig: RateLimitConfig

          if (typeof scopeOrConfig === 'string') {
            const scopeConfig =
              DEFAULT_LIMITS[scopeOrConfig as keyof typeof DEFAULT_LIMITS] ||
              DEFAULT_LIMITS.default
            finalConfig = { ...scopeConfig, ...config }
          } else {
            finalConfig = scopeOrConfig
          }

          const defaultKeyGenerator = (req: Request) => {
            const ip =
              req.headers.get('x-forwarded-for') ||
              req.headers.get('x-real-ip') ||
              'unknown'
            return `${ip}:${new URL(req.url).pathname}`
          }

          const key = finalConfig.keyGenerator
            ? finalConfig.keyGenerator(request)
            : defaultKeyGenerator(request)

          const result = rateLimiter.check(
            key,
            finalConfig.limit,
            finalConfig.windowMs
          )

          if (finalConfig.headers !== false) {
            set.headers['X-RateLimit-Limit'] = finalConfig.limit.toString()
            set.headers['X-RateLimit-Remaining'] = result.remaining.toString()
            set.headers['X-RateLimit-Reset'] = new Date(
              result.resetTime
            ).toISOString()
          }

          if (!result.allowed) {
            set.status = 429

            if (result.retryAfter) {
              set.headers['Retry-After'] = result.retryAfter.toString()
            }

            set.headers[CUSTOM_HEADERS.ERROR] =
              `Haz excedido el limite de peticiones. Inténtalo de nuevo en ${Math.ceil((result.retryAfter ?? 1) / 60)} minutos`

            return 'Too Many Requests'
          }
        }
      }
    }
  })
  .as('scoped')

export const rateLimitUtils = {
  clearAll: () => {
    rateLimiter.destroy()
  },

  getStats: () => rateLimiter.getStats(),

  reset: (key: string) => rateLimiter.reset(key),

  setCustomLimits: (
    limits: Record<string, { limit: number; windowMs: number }>
  ) => {
    Object.assign(DEFAULT_LIMITS, limits)
  }
}
