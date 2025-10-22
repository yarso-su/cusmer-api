import { ROLES } from '@/lib/constants'
import { SettingsService } from '@/lib/elysia_services'
import { rateLimit } from '@/lib/rate-limiter'
import models from '@/models/sqlite'
import PaymentsService from '@/services/payments'
import Elysia, { t } from 'elysia'

const Payments = new Elysia({ name: 'Service.Router.Payments' })
  .use(SettingsService)
  .use(rateLimit)
  .group('/payments', app =>
    app
      .post(
        '/initialize',
        async ({ set, query: { order_id } }) => {
          const res = await PaymentsService.initialize(order_id)

          set.status = 201

          return res
        },
        {
          rateLimit: {
            limit: 15,
            windowMs: 3 * 60 * 1000
          },
          auth: [ROLES.CLIENT],
          query: t.Object({
            order_id: t.Integer({
              min: 1
            })
          })
        }
      )
      .post(
        '/stripe-webhook',
        async ({ request: req }) => {
          const raw = await req.text()

          await PaymentsService.register(
            raw,
            req.headers.get('stripe-signature')
          )

          return {
            received: true
          }
        },
        {
          rateLimit: {
            limit: 5,
            windowMs: 10 * 60 * 1000
          }
        }
      )
      .post(
        '/:id/regenerate-invoice',
        async ({ params: { id } }) => {
          await PaymentsService.regenerateInvoice(id)
        },
        {
          rateLimit: {
            limit: 5,
            windowMs: 30 * 60 * 1000
          },
          auth: [ROLES.ADMIN],
          params: t.Object({
            id: t.Integer({
              min: 1
            })
          })
        }
      )
      .get(
        '/',
        ({ query: { page, limit } }) => {
          const payments = models.payment.findAll(limit, page)

          return {
            payments
          }
        },
        {
          rateLimit: 'default',
          auth: [ROLES.ADMIN],
          query: t.Object({
            limit: t.Optional(t.Integer({ minimum: 1, maximum: 15 })),
            page: t.Optional(t.Integer({ minimum: 1 }))
          })
        }
      )
      .get(
        '/summary',
        () => {
          return {
            taxes: models.payment.getTotalTax(),
            total: models.payment.getAllOfCurrentMonth()
          }
        },
        {
          rateLimit: 'default',
          auth: [ROLES.ADMIN, ROLES.DEV]
        }
      )
      .get(
        '/:id',
        async ({ user, params: { id }, set }) => {
          const invoice = await PaymentsService.getInvoice(id, user)

          set.headers['Content-Type'] = 'application/pdf'
          set.headers['Content-Disposition'] =
            `inline; filename="factura-${id}.pdf"`

          return new Uint8Array(invoice)
        },
        {
          rateLimit: 'upload', // NOTE: Consider increasing the time for the limit on this route
          auth: true,
          params: t.Object({
            id: t.Integer({
              min: 1
            })
          })
        }
      )
      .delete(
        'clear-taxes',
        ({ query: { limit } }) => {
          models.payment.clearTotalTax(limit)
        },
        {
          rateLimit: {
            limit: 5,
            windowMs: 30 * 60 * 1000
          },
          auth: [ROLES.ADMIN],
          query: t.Object({
            limit: t.Integer({
              min: 1
            })
          })
        }
      )
  )

export default Payments
