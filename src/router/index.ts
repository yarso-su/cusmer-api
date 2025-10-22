import Elysia, { t } from 'elysia'
import Users from './users'
import Sessions from './sessions'
import Payments from './payments'
import Orders from './orders'
import Threads from './threads'
import { zoho } from '@/lib/zoho'
import { ADMIN_EMAIL, CLIENT, DOMAIN, ROLES } from '@/lib/constants'
import { OrderLoggerKey } from '@/lib/elysia_services'
import { logger } from '@/services/logger'
import { AuthError } from '@/lib/errors'
import Internal from './internal'
import models from '@/models/sqlite'
import { rateLimit } from '@/lib/rate-limiter'

const RouterService = new Elysia({ name: 'Service.Router' })

  .use(Sessions)
  .use(Users)
  .use(Orders)
  .use(Payments)
  .use(Threads)
  .use(Internal)
  .use(rateLimit)
  .post(
    '/contact',
    async ({ body: { name, email, message }, set }) => {
      const sent = await zoho.message(
        ADMIN_EMAIL,
        'Administrador',
        `"${name}" ha usado el formulario de contacto.<br/><br/>"${message}".`,
        {
          code: email
        }
      )

      if (!sent) set.status = 503
    },
    {
      rateLimit: {
        limit: 3,
        windowMs: 60 * 60 * 1000
      },
      body: t.Object({
        name: t.String({
          maxLength: 60,
          minLength: 3,
          required: true,
          trim: true
        }),
        email: t.String({
          format: 'email',
          required: true,
          trim: true
        }),
        message: t.String({
          maxLength: 240,
          minLength: 6,
          required: true,
          trim: true
        })
      })
    }
  )
  .get(
    '/logs',
    () => {
      const logs = models.log.findAll()

      return {
        logs
      }
    },
    {
      auth: [ROLES.ADMIN, ROLES.DEV],
      rateLimit: 'default'
    }
  )
  .use(OrderLoggerKey)
  .post(
    '/logger',
    ({ loggerData: { key }, body: { origin, content }, set }) => {
      const id = models.order.getServiceIdByLoggerKey(key)
      if (!id) {
        throw new AuthError()
      }

      logger.order(id, origin, content)

      set.status = 201
    },
    {
      loggerRequest: true,
      body: t.Object({
        origin: t.String(),
        content: t.String()
      }),
      rateLimit: {
        limit: 100,
        windowMs: 60 * 1000
      }
    }
  )
  .delete(
    '/clear-billing-cookie',
    ({ cookie: { billing_required } }) => {
      billing_required.set({
        value: '1',
        secure: true,
        httpOnly: true,
        sameSite: 'none',
        path: '/',
        domain: DOMAIN,
        maxAge: -1
      })
    },
    {
      auth: [ROLES.CLIENT],
      rateLimit: {
        limit: 5,
        windowMs: 10 * 60 * 1000
      }
    }
  )
  .get(
    '/export-db',
    async ({ set }) => {
      const backupPath = `/tmp/backup-${Date.now()}.db`

      models.db.prepare(`VACUUM INTO '${backupPath}'`).run()

      const buffer = await Bun.file(backupPath).arrayBuffer()
      Bun.spawn(['rm', backupPath])

      set.headers['Content-Type'] = 'application/x-sqlite3'
      set.headers['Content-Disposition'] =
        `attachment; filename="backup-${new Date().toISOString().split('T')[0]}.db"`
      set.headers['Content-Length'] = buffer.byteLength.toString()

      return buffer
    },
    {
      auth: [ROLES.ADMIN],
      rateLimit: {
        limit: 3,
        windowMs: 30 * 60 * 1000
      }
    }
  )

export default RouterService
