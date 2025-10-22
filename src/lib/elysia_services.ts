import Elysia, { t } from 'elysia'
import {
  AuthError,
  ForbiddenError,
  NotFoundError,
  RouteProtectionError,
  ServiceError,
  UserNotVerifiedError,
  ValidationError
} from './errors'
import { jwt } from '@elysiajs/jwt'
import {
  ADMIN_EMAIL,
  CLIENT,
  CUSTOM_HEADERS,
  DOMAIN,
  ORDER_STATUSES,
  ORDER_STATUSES_WHICH_REQUIRE_PAYMENT,
  SECRETS
} from './constants'
import { cron, Patterns } from '@elysiajs/cron'
import PaymentsService from '@/services/payments'
import SessionsService from '@/services/sessions'
import { applyProportionalDiscount, newExp } from './utils'
import { stripeService } from './stripe'
import { addMonth, addDay, isBefore } from '@formkit/tempo'
import { logger } from '@/services/logger'
import { zoho } from './zoho'
import models from '@/models/sqlite'

export const OrderLoggerKey = new Elysia({ name: 'Service.OrderLoggerKey' })
  .use(
    jwt({
      name: 'loggerJwt',
      secret: SECRETS.LOGGER,
      schema: t.Object({
        key: t.Integer({
          minimum: 1
        })
      }),
      exp: '90d'
    })
  )
  .macro({
    loggerRequest: {
      async resolve({ loggerJwt, query: { token } }) {
        const data = await loggerJwt.verify(token)
        if (!data) throw new AuthError()

        return {
          loggerData: {
            key: data.key
          }
        }
      }
    }
  })

const AuthService = new Elysia({ name: 'Service.Auth' })
  .use(
    jwt({
      name: 'accessJwt',
      secret: SECRETS.ACCESS,
      schema: t.Object({
        id: t.String(),
        role: t.Number()
      }),
      exp: '2m'
    })
  )
  .use(
    jwt({
      name: 'refreshJwt',
      secret: SECRETS.REFRESH,
      schema: t.Object({
        id: t.String()
      }),
      exp: '30d'
    })
  )
  .macro({
    auth(validRoles: true | [number] | [number, number]) {
      // NOTE: Be aware of recent updates of Elysia, currently this macro distpatches a warning on stdout
      return {
        async resolve({ cookie: { access, refresh }, accessJwt, refreshJwt }) {
          if (!access.value && !refresh.value) throw new RouteProtectionError()

          let newTokenRequired = false
          // IMPORTANT: This change hasn't been tested yet
          let data: { id: string; role: number } | null | false =
            typeof access.value === 'string'
              ? await accessJwt.verify(access.value)
              : null

          if (!data) {
            // IMPORTANT: This change hasn't been tested yet
            if (typeof refresh.value !== 'string') {
              throw new RouteProtectionError()
            }
            const content = await refreshJwt.verify(refresh.value)
            if (!content) throw new RouteProtectionError()
            newTokenRequired = true

            const { user } = SessionsService.validateCredentials(content.id)
            data = user
          }

          if (Array.isArray(validRoles) && !validRoles.includes(data.role)) {
            throw new ForbiddenError(
              'You are not authorized to access this route'
            )
          }

          if (newTokenRequired) {
            access.set({
              value: await accessJwt.sign({
                ...data,
                exp: newExp(120)
              }),
              secure: true,
              httpOnly: true,
              sameSite: 'none',
              path: '/',
              domain: DOMAIN,
              maxAge: 60 * 3
            })

            return { user: data }
          }

          access.set({
            value: access.value,
            secure: true,
            httpOnly: true,
            sameSite: 'none',
            path: '/',
            domain: DOMAIN,
            maxAge: 60 * 3
          })

          return { user: data }
        }
      }
    }
  })
  .as('scoped')

const CronService = new Elysia({ name: 'Service.Cron' })
  .use(
    cron({
      name: 'tax-notification',
      pattern: Patterns.EVERY_DAY_AT_2PM,
      timezone: 'America/Mexico_City',
      catch: (err: any) => {
        logger.internal('CronService.tax-notification', err)
      },
      async run() {
        await zoho.message(
          ADMIN_EMAIL,
          'Administrador',
          'Revisa la cantidad de impuestos acumulados en el Dashboard.',
          {
            link: {
              text: 'Ir al Dashboard',
              url: `${CLIENT}/su`
            }
          }
        )
      }
    })
  )
  .use(
    cron({
      name: 'generate-invoices',
      pattern: Patterns.EVERY_10_MINUTES,
      timezone: 'America/Mexico_City',
      catch: (err: any) => {
        logger.internal('CronService.generate-invoices', err)
      },
      async run() {
        const start = Date.now()
        const tasks = models.payment.getPendingInvoiceTasks()

        for (const task of tasks) {
          if (Date.now() - start > 10000) return

          try {
            await PaymentsService.generateInvoice(task)
          } catch (err: any) {
            logger.internal(
              `CronService.generate-invoices [task: ${task ?? 'unkown'}]`,
              err
            )
          }
        }
      }
    })
  )
  .use(
    cron({
      name: 'generate-global-invoice',
      pattern: Patterns.EVERY_MINUTE,
      timezone: 'America/Mexico_City',
      catch: (err: any) => {
        logger.internal('CronService.generate-invoices', err)
      },
      async run() {
        const payments = models.payment.getPendingGlobalInvoiceTasks()
        if (payments.length === 0) return

        await PaymentsService.generateGlobalInvoice(payments)
      }
    })
  )
  .use(
    cron({
      name: 'expire-sessions',
      pattern: Patterns.EVERY_6_HOURS,
      timezone: 'America/Mexico_City',
      catch: (err: any) => {
        logger.internal('CronService.expire-sessions', err)
      },
      async run() {
        const start = Date.now()
        const sessions = models.session.findAllActive()

        for (const session of sessions) {
          if (Date.now() - start > 3000) return // NOTE: Time limit

          if (
            start - new Date(session.created_at).getTime() >
            1000 * 60 * 60 * 24 * 30
          ) {
            models.session.drop(session.id)
          }
        }
      }
    })
  )
  .use(
    cron({
      name: 'expire-session-codes',
      pattern: Patterns.EVERY_DAY_AT_1AM,
      timezone: 'America/Mexico_City',
      catch: (err: any) => {
        logger.internal('CronService.expire-session-codes', err)
      },
      async run() {
        const start = Date.now()
        const codes = models.session.getCodes()

        for (const code of codes) {
          if (Date.now() - start > 3000) return // NOTE: Time limit

          if (start - new Date(code.created_at).getTime() > 1000 * 60 * 5) {
            models.session.dropCode(code.id)
          }
        }
      }
    })
  )
  .use(
    cron({
      name: 'drop-payment-intents',
      pattern: Patterns.EVERY_DAY_AT_3AM,
      timezone: 'America/Mexico_City',
      catch: (err: any) => {
        logger.internal('CronService.drop-payment-intents', err)
      },
      async run() {
        const start = Date.now()
        const intents = models.order.getAllPaymentIntents()

        for (const intent of intents) {
          if (Date.now() - start > 3000) return // NOTE: Time limit

          if (
            start - new Date(intent.created_at).getTime() >
            1000 * 60 * 60 * 24
          ) {
            models.order.dropPaymentIntent(intent.order_id)
          }
        }
      }
    })
  )
  .use(
    cron({
      name: 'services-not-recurring-due-for-next-payment',
      pattern: Patterns.EVERY_HOUR,
      timezone: 'America/Mexico_City',
      catch: (err: any) => {
        logger.internal(
          'CronService.services-not-recurring-due-for-next-payment',
          err
        )
      },
      async run() {
        const start = Date.now()
        const orders = models.order.findDueForNextPayment()

        for (const order of orders) {
          if (Date.now() - start > 10000) return // NOTE: Time limit

          const daysBetweenPayments =
            Math.ceil(order.duration_weeks / order.payment_installments) * 7
          const nextPaymentDue = addDay(
            order.first_payment_created_at,
            daysBetweenPayments
          )

          if (isBefore(new Date(), nextPaymentDue)) continue

          try {
            models.order.setStatus(order.id, ORDER_STATUSES.PAYMENT_REQUIRED)
            zoho.message(
              order.user_email,
              order.user_name,
              'Uno de tus servicios requiere que realices el siguiente pago.',
              {
                link: {
                  text: 'Revisar servicio',
                  url: `${CLIENT}/platform/services/${order.id}`
                }
              }
            )
            zoho.message(
              ADMIN_EMAIL,
              'Administrador',
              'Un servicio esta esperando a que el cliente realice el siguiente pago.',
              {
                link: {
                  text: 'Revisar servicio',
                  url: `${CLIENT}/su/services/${order.id}`
                }
              }
            )
          } catch (err: any) {
            logger.internal(
              `CronService. [services-not-recurring-due-for-next-payment, order: ${order.id}]`,
              err
            )
          }
        }
      }
    })
  )
  .use(
    cron({
      name: 'services-due-for-next-payment',
      pattern: Patterns.EVERY_HOUR,
      timezone: 'America/Mexico_City',
      catch: (err: any) => {
        logger.internal('CronService.services-due-for-next-payment', err)
      },
      async run() {
        const start = Date.now()
        const orders = models.order.findRecurringDueForNextPayment()

        for (const { id, last_payment_created_at: prev } of orders) {
          if (Date.now() - start > 10000) return // NOTE: Time limit

          if (isBefore(new Date(), addMonth(prev, 1))) {
            continue
          }

          try {
            models.order.setPendingCharge(id)
          } catch (err: any) {
            logger.internal(
              `CronService. [services-due-for-next-payment, order: ${id}]`,
              err
            )
          }
        }
      }
    })
  )
  .use(
    cron({
      name: 'pending-charges',
      pattern: Patterns.EVERY_30_MINUTES,
      timezone: 'America/Mexico_City',
      catch: (err: any) => {
        logger.internal('CronService.pending-charges', err)
      },
      async run() {
        const start = Date.now()
        const charges = models.order.getAllPendingCharges()

        for (const charge of charges) {
          if (Date.now() - start > 20000) return // NOTE: Time limit

          try {
            const order = models.order.findByIdSummary(charge.id)
            if (!order) throw new Error('Order not found')

            if (
              !ORDER_STATUSES_WHICH_REQUIRE_PAYMENT.includes(order.status) ||
              !order.is_recurring
            ) {
              continue
            }

            const user = models.user.findById(order.user_id)
            if (!user) throw new Error('User not found')

            if (charge.attempt_count === 3) {
              models.order.dropPendingCharge(charge.id)
              models.order.setStatus(charge.id, ORDER_STATUSES.PAYMENT_REQUIRED)
              zoho.message(
                user.email,
                user.name,
                'No se ha podido procesar el pago de uno de tus servicios. Por favor, agrega un método de pago diferente.',
                {
                  link: {
                    text: 'Revisar servicio',
                    url: `${CLIENT}/platform/services/${charge.id}`
                  }
                }
              )

              continue
            }

            const paymentMethod = models.order.getPaymentMethod(charge.id)
            if (!paymentMethod) {
              models.order.dropPendingCharge(charge.id)
              models.order.setStatus(charge.id, ORDER_STATUSES.PAYMENT_REQUIRED)
              zoho.message(
                user.email,
                user.name,
                'No se ha podido procesar el pago de uno de tus servicios. Por favor, agrega un método de pago diferente.',
                {
                  link: {
                    text: 'Revisar servicio',
                    url: `${CLIENT}/platform/services/${charge.id}`
                  }
                }
              )

              logger.internal(
                `CronService[pending-charges (order: ${charge.id})]`,
                'Payment method not found for recurring charge'
              )

              continue
            }

            const stripeCustomer = models.user.getStripeCustomerId(
              order.user_id
            )
            if (!stripeCustomer) {
              throw new Error('Stripe Customer not found')
            }

            const items = models.order.getItems(charge.id)
            const discount = models.order.getDiscount(charge.id)
            const discountPct = discount?.percentage ?? 0
            const distribution = applyProportionalDiscount(items, discountPct)

            models.order.dropPaymentIntent(charge.id)
            const intent = await stripeService.createRecurrentPaymentIntent(
              distribution.total,
              charge.id,
              paymentMethod,
              stripeCustomer
            )

            models.order.savePaymentIntent({
              service_id: charge.id,
              stripe_id: intent.id,
              applied_discount: discountPct
            })
            models.order.dropPendingCharge(charge.id)

            if (discount && discount.disposable) {
              models.order.deleteDiscount(charge.id)
            }
          } catch (err: any) {
            logger.internal(
              `CronService[pending-charges (order: ${charge.id})]`,
              err
            )
          }
        }
      }
    })
  )
  .as('scoped')

export const SettingsService = new Elysia({ name: 'Service.Settings' })
  .use(
    jwt({
      name: 'verificationJwt',
      secret: SECRETS.VERIFICATION,
      schema: t.Object({
        id: t.String()
      }),
      exp: '5m'
    })
  )
  .macro({
    verifyRequest: {
      async resolve({ verificationJwt, query: { token } }) {
        const data = await verificationJwt.verify(token)
        if (!data) throw new AuthError()

        return {
          verifyData: {
            id: data.id
          }
        }
      }
    }
  })
  .error({
    ServiceError,
    ForbiddenError,
    AuthError,
    RouteProtectionError,
    NotFoundError,
    UserNotVerifiedError,
    ValidationError
  })
  .onError(
    async ({
      request: req,
      set,
      code,
      cookie: { access, refresh },
      error,
      verificationJwt
    }) => {
      try {
        switch (code) {
          case 'PARSE':
            set.headers[CUSTOM_HEADERS.ERROR] = 'Solicitud inválida'
            set.status = 400
            return
          case 'VALIDATION':
            set.headers[CUSTOM_HEADERS.ERROR] =
              'Solicitud inválida. Validación fallida'
            set.status = 400
            return
          case 'ValidationError':
            set.headers[CUSTOM_HEADERS.ERROR] = error.message
            set.status = 400
            return
          case 'NotFoundError':
            set.headers[CUSTOM_HEADERS.ERROR] = error.message
            set.status = 404
            return
          case 'ForbiddenError':
            set.headers[CUSTOM_HEADERS.ERROR] = error.message
            set.status = 403
            return
          case 'AuthError':
            set.headers[CUSTOM_HEADERS.ERROR] = 'Sin autorización'
            set.status = 401
            return
          case 'UserNotVerifiedError':
            const token = await verificationJwt.sign({
              id: error.user.id,
              exp: newExp(60 * 5)
            })
            const sent = await zoho.verify(
              error.user.email,
              error.user.name,
              token
            )

            if (!sent) {
              set.headers[CUSTOM_HEADERS.ERROR] =
                'No se hemos podido enviar el correo para verificar tu cuenta'
              set.status = 503
              return
            }

            set.headers[CUSTOM_HEADERS.ERROR] =
              'Tu cuenta no ha sido verificada. Te hemos enviado un correo de verificación'
            set.status = 401

            return
          case 'RouteProtectionError':
            if (access.value) {
              access.set({
                value: access.value,
                secure: true,
                httpOnly: true,
                sameSite: 'none',
                path: '/',
                domain: DOMAIN,
                maxAge: -1
              })
            }
            if (refresh.value) {
              refresh.set({
                value: refresh.value,
                secure: true,
                httpOnly: true,
                sameSite: 'none',
                path: '/',
                domain: DOMAIN,
                maxAge: -1
              })
            }

            set.headers[CUSTOM_HEADERS.ERROR] =
              'Debes estar logeado para acceder a esta ruta'
            set.status = 401

            return
          case 'ServiceError':
            logger.internal(error.service, error.originalError)

            set.headers[CUSTOM_HEADERS.ERROR] = 'Servicio no disponible'
            set.status = 503

            return
          default:
            if (typeof code === 'string' && code.startsWith('ERR_POSTGRES_')) {
              logger.internal(`PostgresError [${req.url}]`, error)
              set.headers[CUSTOM_HEADERS.ERROR] = 'Servicio no disponible'
              set.status = 503

              return
            }

            logger.internal(`Unknown[${req.url}]`, error)

            set.headers[CUSTOM_HEADERS.ERROR] = 'Error interno del servidor'

            return
        }
      } catch (err: any) {
        set.headers[CUSTOM_HEADERS.ERROR] = 'Error interno del servidor'
        set.status = 500

        logger.internal(`ErrorHandler[${req.url}]`, err)
        return
      }
    }
  )
  .use(CronService)
  .use(AuthService)
  .as('scoped')
