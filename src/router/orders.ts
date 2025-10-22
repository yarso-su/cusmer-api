import { CLIENT, ROLES } from '@/lib/constants'
import { OrderLoggerKey, SettingsService } from '@/lib/elysia_services'
import { rateLimit } from '@/lib/rate-limiter'
import { zoho } from '@/lib/zoho'
import { Uuid } from '@/lib/schemas'
import { newExp } from '@/lib/utils'
import models from '@/models/sqlite'
import OrdersService from '@/services/orders'
import Elysia, { t } from 'elysia'

const Name = t.String({
  trim: true,
  minLength: 6,
  maxLength: 60
})
const Description = t.String({
  trim: true,
  minLength: 12,
  maxLength: 240
})
const Tag = t.String({
  trim: true,
  maxLength: 60,
  minLength: 6
})
const Duration = t.Integer({
  minimum: 2,
  maximum: 48,
  multipleOf: 2
})
const PaymentInstallments = t.Integer({ minimum: 1, maximum: 12 })
const ItemType = t.Integer({ minimum: 1, maximum: 28 })

const Orders = new Elysia({ name: 'Service.Router.Services' })
  .use(SettingsService)
  .use(OrderLoggerKey)
  .use(rateLimit)
  .group('/orders', app =>
    app
      .post(
        '/',
        ({ body, set }) => {
          const {
            user,
            order: { id }
          } = OrdersService.add(body)
          zoho.message(
            user.email,
            user.name,
            'Se ha registrado un servicio en tu cuenta.',
            {
              link: {
                url: `${CLIENT}/platform/services/${id}`,
                text: 'Revisar servicio'
              }
            }
          )

          set.status = 201

          return {
            id
          }
        },
        {
          rateLimit: 'upload',
          auth: [ROLES.ADMIN, ROLES.DEV],
          body: t.Object({
            user_id: Uuid,
            name: Name,
            description: Description,
            tag: Tag,
            duration_weeks: Duration,
            payment_installments: PaymentInstallments,
            is_recurring: t.Boolean(),
            portfolio_consent: t.Boolean()
          })
        }
      )
      .put(
        '/:id',
        ({ params: { id }, body }) => {
          OrdersService.update(id, body)
        },
        {
          rateLimit: 'upload',
          auth: [ROLES.ADMIN, ROLES.DEV],
          params: t.Object({
            id: t.Integer({
              minimum: 1
            })
          }),
          body: t.Object(
            {
              name: Name,
              description: Description,
              tag: Tag,
              duration_weeks: Duration,
              payment_installments: PaymentInstallments,
              portfolio_consent: t.Boolean(),
              is_recurring: t.Boolean()
            },
            {
              minProperties: 1
            }
          )
        }
      )
      .patch(
        '/:id/status',
        ({ params: { id }, body: { status } }) => {
          OrdersService.updateStatus(id, status)
        },
        {
          rateLimit: 'upload',
          auth: [ROLES.ADMIN, ROLES.DEV],
          params: t.Object({
            id: t.Integer({
              minimum: 1
            })
          }),
          body: t.Object({
            status: t.Integer({ minimum: 1, maximum: 10 })
          })
        }
      )
      .put(
        '/:id/discount',
        ({ params: { id }, body }) => {
          const { user } = OrdersService.setDiscount(id, body)

          zoho.message(
            user.email,
            user.name,
            'Se ha registrado un descuento en uno de tus servicios.',
            {
              link: {
                url: `${CLIENT}/platform/services/${id}`,
                text: 'Revisar servicio'
              }
            }
          )
        },
        {
          rateLimit: 'upload',
          auth: [ROLES.ADMIN],
          params: t.Object({
            id: t.Integer({
              minimum: 1
            })
          }),
          body: t.Object({
            percentage: t.Integer({ minimum: 1, maximum: 100 }),
            description: t.String({
              trim: true,
              maxLength: 80
            }),
            disposable: t.Boolean()
          })
        }
      )
      .delete(
        '/:id/discount',
        ({ params: { id } }) => {
          OrdersService.removeDiscount(id)
        },
        {
          rateLimit: 'upload',
          auth: [ROLES.ADMIN],
          params: t.Object({
            id: t.Integer({
              minimum: 1
            })
          })
        }
      )
      .post(
        '/items',
        ({ body, set }) => {
          const itemId = OrdersService.addItem(body)
          set.status = 201

          return {
            itemId
          }
        },
        {
          rateLimit: 'upload', // NOTE: Consider increasing the time for the limit on this route
          auth: [ROLES.ADMIN, ROLES.DEV],
          body: t.Object({
            service_id: t.Integer({
              minimum: 1
            }),
            name: t.String({
              trim: true,
              minLength: 6,
              maxLength: 60
            }),
            description: t.String({
              trim: true,
              minLength: 12,
              maxLength: 240
            }),
            type: ItemType,
            cost: t.Integer({
              minimum: 50,
              maximum: 99999
            })
          })
        }
      )
      .put(
        '/items/:id',
        ({ params: { id }, body }) => {
          OrdersService.updateItem(id, body)
        },
        {
          rateLimit: 'upload',
          auth: [ROLES.ADMIN, ROLES.DEV],
          params: t.Object({
            id: t.Integer({
              minimum: 1
            })
          }),
          body: t.Object(
            {
              name: t.String({
                trim: true,
                minLength: 6,
                maxLength: 60
              }),
              description: t.String({
                trim: true,
                minLength: 12,
                maxLength: 240
              }),
              type: ItemType,
              cost: t.Integer({
                minimum: 50,
                maximum: 99999
              })
            },
            {
              minProperties: 1
            }
          )
        }
      )
      .delete(
        '/items/:id',
        ({ params: { id } }) => {
          OrdersService.removeItem(id)
        },
        {
          rateLimit: 'upload',
          auth: [ROLES.ADMIN, ROLES.DEV],
          params: t.Object({
            id: t.Integer({
              minimum: 1
            })
          })
        }
      )
      .get(
        '/',
        ({ query: { limit } }) => {
          const orders = models.order.findAll(limit)
          return {
            orders
          }
        },
        {
          rateLimit: 'default',
          auth: [ROLES.ADMIN, ROLES.DEV],
          query: t.Object({
            limit: t.Integer({ minimum: 1, maximum: 15 })
          })
        }
      )
      .get(
        '/:id',
        ({ user, params: { id } }) => {
          const order = OrdersService.getById(id, user)

          return {
            order
          }
        },
        {
          rateLimit: 'default',
          auth: true,
          params: t.Object({
            id: t.Integer({
              minimum: 1
            })
          })
        }
      )
      .get(
        '/by-status/:status/:page',
        ({ params: { page, status } }) => {
          const orders = models.order.findAllByStatus(status, page)

          return {
            orders
          }
        },
        {
          rateLimit: 'default',
          auth: [ROLES.ADMIN, ROLES.DEV],
          params: t.Object({
            status: t.Integer({ minimum: 1, maximum: 10 }),
            page: t.Optional(t.Integer({ minimum: 1 }))
          })
        }
      )
      .get(
        '/:id/name',
        ({ user: { id: userId }, params: { id } }) => {
          const name = OrdersService.getNameById(id, userId)

          return {
            name
          }
        },
        {
          rateLimit: 'default',
          auth: true,
          params: t.Object({
            id: t.Integer({
              minimum: 1
            })
          })
        }
      )
      .get(
        '/:id/status',
        ({ params: { id } }) => {
          const status = OrdersService.getStatusById(id)

          return {
            status
          }
        },
        {
          rateLimit: 'default',
          auth: [ROLES.CLIENT],
          params: t.Object({
            id: t.Integer({
              minimum: 1
            })
          })
        }
      )
      .get(
        '/:id/payments',
        ({ params: { id } }) => {
          const payments = models.payment.findAllByOrder(id)

          return {
            payments
          }
        },
        {
          rateLimit: 'default',
          auth: true,
          params: t.Object({
            id: t.Integer({
              minimum: 1
            })
          })
        }
      )
      .get(
        '/:id/threads',
        ({ params: { id } }) => {
          const threads = models.thread.findAllByOrder(id)

          return {
            threads
          }
        },
        {
          rateLimit: 'default',
          auth: true,
          params: t.Object({
            id: t.Integer({
              minimum: 1
            })
          })
        }
      )
      .get(
        '/:id/logs',
        ({ params: { id } }) => {
          const logs = models.order.getLogs(id)

          return {
            logs
          }
        },
        {
          rateLimit: 'default',
          auth: [ROLES.ADMIN, ROLES.DEV],
          params: t.Object({
            id: t.Integer({
              minimum: 1
            })
          })
        }
      )
      .get(
        '/summary/names',
        ({ user: { id } }) => {
          const names = models.order.getAllNamesByUser(id)

          return {
            names
          }
        },
        {
          rateLimit: 'default',
          auth: [ROLES.CLIENT]
        }
      )
      .post(
        '/:id/logger-token',
        async ({ params: { id }, loggerJwt }) => {
          const key = OrdersService.generateNewLoggerKey(id) as number
          const token = await loggerJwt.sign({
            key,
            exp: newExp(60 * 60 * 24 * 90)
          })

          return {
            token
          }
        },
        {
          rateLimit: 'upload',
          auth: [ROLES.ADMIN],
          params: t.Object({
            id: t.Integer({
              minimum: 1
            })
          })
        }
      )
      .delete(
        '/:id/logger-token',
        ({ params: { id } }) => {
          models.order.dropLoggerKey(id)
        },
        {
          rateLimit: 'upload',
          auth: [ROLES.ADMIN],
          params: t.Object({
            id: t.Integer({
              minimum: 1
            })
          })
        }
      )
      .put(
        '/:id/contract',
        ({ params: { id }, body }) => {
          OrdersService.updateContract(id, body)
        },
        {
          rateLimit: 'upload',
          auth: [ROLES.ADMIN],
          params: t.Object({
            id: t.Integer({
              minimum: 1
            })
          }),
          body: t.Object({
            object: t.String({
              trim: true,
              minLength: 10,
              maxLength: 140
            }),
            goals: t.Array(
              t.Object({
                description: t.String({
                  trim: true,
                  minLength: 10,
                  maxLength: 140
                }),
                type: t.Union([
                  t.Literal('feature'),
                  t.Literal('technology'),
                  t.Literal('technical_restriction')
                ])
              }),
              {
                minItems: 1,
                maxItems: 30
              }
            ),
            deliverables: t.Array(
              t.Object({
                label: t.String({
                  trim: true,
                  minLength: 10,
                  maxLength: 60
                }),
                description: t.String({
                  trim: true,
                  minLength: 10,
                  maxLength: 140
                }),
                method: t.String({
                  trim: true,
                  minLength: 10,
                  maxLength: 60
                }),
                acceptance: t.String({
                  trim: true,
                  minLength: 10,
                  maxLength: 220
                })
              }),
              {
                minItems: 1,
                maxItems: 30
              }
            ),
            usageLimits: t.Array(
              t.Object({
                label: t.String({
                  trim: true,
                  minLength: 10,
                  maxLength: 60
                }),
                unit: t.String({
                  trim: true,
                  minLength: 2,
                  maxLength: 60
                }),
                amount: t.Integer({
                  minimum: 1,
                  maximum: 9999999
                })
              }),
              {
                minItems: 0,
                maxItems: 10
              }
            )
          })
        }
      )
      .get(
        '/:id/contract',
        ({ user, params: { id } }) => {
          const order = OrdersService.getOrderWithContract(id, user)

          return {
            order
          }
        },
        {
          rateLimit: 'default',
          auth: true,
          params: t.Object({
            id: t.Integer({
              minimum: 1
            })
          })
        }
      )
  )

export default Orders
