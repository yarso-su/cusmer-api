import { Elysia } from 'elysia'
import RouterService from './router'
import { CLIENT, CUSTOM_HEADERS, PROCESS_PORT } from './lib/constants'
import models from './models/sqlite'

let isShuttingDown = false

const app = new Elysia()
  .onRequest(({ request, set }) => {
    if (isShuttingDown) {
      set.status = 503
      set.headers['Retry-After'] = '10'
      return { error: 'Server is shutting down' }
    }

    set.headers['x-frame-options'] = 'DENY'
    set.headers['x-content-type-options'] = 'nosniff'
    set.headers['x-xss-protection'] = '1; mode=block'
    set.headers['strict-transport-security'] =
      'max-age=31536000; includeSubDomains; preload'
    set.headers['referrer-policy'] = 'strict-origin-when-cross-origin'
    set.headers['permissions-policy'] =
      'geolocation=(), microphone=(), camera=()'
    set.headers['content-security-policy'] =
      "default-src 'self'; object-src 'none'; base-uri 'self';"

    set.headers['Access-Control-Expose-Headers'] =
      `${CUSTOM_HEADERS.ERROR}, ${CUSTOM_HEADERS.MESSAGE}, ${CUSTOM_HEADERS.EMAIL_SENT}, x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset, retry-after`

    set.headers['Access-Control-Allow-Origin'] = CLIENT
    set.headers['Access-Control-Allow-Credentials'] = 'true'

    if (request.method === 'OPTIONS') {
      set.headers['Access-Control-Allow-Methods'] =
        'GET, POST, PUT, DELETE, OPTIONS, PATCH'
      set.headers['Access-Control-Allow-Headers'] =
        'Content-Type, Authorization, X-Requested-With'
      set.headers['Access-Control-Max-Age'] = '86400'
      set.status = 204

      return new Response(null, { status: 204 })
    }
  })
  .use(RouterService)

app.listen(PROCESS_PORT)
console.log(`🚀 Server is running on port ${PROCESS_PORT}`)

const shutdown = async (signal: string) => {
  if (isShuttingDown) return
  isShuttingDown = true

  console.log(`\n📉 Received ${signal}, starting graceful shutdown...`)

  try {
    app.stop()
    console.log('✅ Server stopped accepting new requests')

    await new Promise(resolve => setTimeout(resolve, 1000))

    models.db.close()
    console.log('✅ Database connection closed')

    await new Promise(resolve => setTimeout(resolve, 500))

    console.log('👋 Graceful shutdown completed')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error during shutdown:', error)
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

process.on('uncaughtException', error => {
  console.error('💥 Uncaught Exception:', error)
  shutdown('uncaughtException')
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason)
  shutdown('unhandledRejection')
})
