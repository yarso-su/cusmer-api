import { CLIENT, CUSTOM_HEADERS, DOMAIN, ROLES, SECRETS } from '@/lib/constants'
import { SettingsService } from '@/lib/elysia_services'
import { AuthError } from '@/lib/errors'
import { factura } from '@/lib/factura'
import { rateLimit } from '@/lib/rate-limiter'
import { zoho } from '@/lib/zoho'
import {
  Email,
  FacturaClient,
  Name,
  Password,
  Role,
  ThreadStatus,
  Uuid
} from '@/lib/schemas'
import { newExp } from '@/lib/utils'
import models from '@/models/sqlite'
import UsersService from '@/services/users'
import jwt from '@elysiajs/jwt'
import Elysia, { t } from 'elysia'

const secretSchema = t.Object({
  key: t.String(),
  content: t.String({
    minLength: 4,
    maxLength: 100
  }),
  iv: t.String({
    minLength: 16,
    maxLength: 16
  })
})

const Users = new Elysia({ name: 'Service.Router.Users' })
  .use(SettingsService)
  .use(
    jwt({
      name: 'registerJwt',
      secret: SECRETS.REGISTER_USER,
      schema: t.Object({
        email: t.String(),
        role: t.Number()
      }),
      exp: '5m'
    })
  )
  .use(
    jwt({
      name: 'passwordResetJwt',
      secret: SECRETS.PASSWORD_RESET,
      schema: t.Object({
        id: t.String()
      }),
      exp: '2m'
    })
  )
  .use(
    jwt({
      name: 'updateEmailJwt',
      secret: SECRETS.EMAIL_UPDATE,
      schema: t.Object({
        id: t.String(),
        email: Email
      }),
      exp: '2m'
    })
  )
  .macro({
    registerRequest: {
      async resolve({ registerJwt, query: { token } }) {
        const data = await registerJwt.verify(token)
        if (!data) throw new AuthError()

        return {
          registerData: {
            email: data.email,
            role: data.role
          }
        }
      }
    },
    resetPasswordRequest: {
      async resolve({ passwordResetJwt, query: { token } }) {
        const data = await passwordResetJwt.verify(token)
        if (!data) throw new AuthError()

        return {
          resetPasswordData: {
            id: data.id
          }
        }
      }
    },
    updateEmailRequest: {
      async resolve({ updateEmailJwt, query: { token } }) {
        const data = await updateEmailJwt.verify(token)
        if (!data) throw new AuthError()

        return {
          updateEmailData: {
            id: data.id,
            email: data.email
          }
        }
      }
    }
  })
  .use(rateLimit)
  .group('/users', app =>
    app
      .post(
        '/',
        async ({
          body,
          verificationJwt,
          registerData: data,
          request: { headers },
          set
        }) => {
          const { user } = await UsersService.register(
            body,
            data,
            headers.get('user-agent') ?? 'N/A'
          )
          const token = await verificationJwt.sign({
            id: user.id,
            exp: newExp(60 * 5)
          })

          // NOTE: Consider not waiting for the email to be sent
          const sent = await zoho.verify(user.email, user.name, token)

          if (sent) {
            set.headers[CUSTOM_HEADERS.EMAIL_SENT] = '1'
          }
          set.status = 201

          return
        },
        {
          rateLimit: {
            limit: 3,
            windowMs: 6 * 60 * 60 * 1000
          },
          registerRequest: true,
          body: t.Object({
            name: Name,
            password: Password,
            termsAndPoliciesAccepted: t.Boolean()
          }),
          query: t.Object({
            token: t.String()
          })
        }
      )
      .post(
        '/:id/send-notification',
        ({ params: { id }, body: { content } }) => {
          const user = UsersService.getById(id)
          zoho.message(user.email, user.name, content)
        },
        {
          rateLimit: 'upload',
          auth: [ROLES.ADMIN],
          params: t.Object({
            id: Uuid
          }),
          body: t.Object({
            content: t.String({
              minLength: 8,
              maxLength: 240,
              trim: true
            })
          })
        }
      )
      .post(
        '/send-register-request',
        async ({ body, registerJwt, set }) => {
          const token = await registerJwt.sign({ ...body, exp: newExp(60 * 5) })
          await zoho.register(body.email, token)

          set.status = 201
        },
        {
          rateLimit: 'upload',
          auth: [ROLES.ADMIN],
          body: t.Object({
            email: Email,
            role: Role
          })
        }
      )
      .post(
        '/send-reset-password-token',
        async ({ body: { email }, passwordResetJwt, set }) => {
          const { user } = UsersService.getByEmail(email)
          const token = await passwordResetJwt.sign({
            id: user.id,
            exp: newExp(60 * 2)
          })
          await zoho.passwordReset(email, user.name, token)

          set.status = 201
        },
        {
          rateLimit: 'auth',
          body: t.Object({
            email: Email
          })
        }
      )
      .patch(
        '/reset-password',
        async ({
          body: { password },
          resetPasswordData,
          refreshJwt,
          cookie: { refresh }
        }) => {
          // NOTE: Observe this behaviour. New session should be created
          const id = await UsersService.resetPassword(
            resetPasswordData.id,
            password
          )

          const token = await refreshJwt.sign({
            id,
            exp: newExp(60 * 60 * 24 * 30)
          })

          refresh.set({
            value: token,
            secure: true,
            httpOnly: true,
            sameSite: 'none',
            path: '/',
            domain: DOMAIN,
            maxAge: 60 * 60 * 24 * 30
          })
        },
        {
          rateLimit: 'auth',
          resetPasswordRequest: true,
          body: t.Object({
            password: Password
          }),
          query: t.Object({
            token: t.String()
          })
        }
      )
      .post(
        '/send-update-email-token',
        async ({ user, updateEmailJwt, set, body: { email } }) => {
          const data = UsersService.getById(user.id)
          const token = await updateEmailJwt.sign({
            id: user.id,
            email,
            exp: newExp(60 * 2)
          })
          await zoho.updateEmail(data.email, data.name, token)

          set.status = 201
        },
        {
          rateLimit: 'auth',
          auth: true,
          body: t.Object({
            email: Email
          })
        }
      )
      .patch(
        '/update-email',
        async ({
          cookie: { refresh, access },
          updateEmailData: { id, email }
        }) => {
          const { user } = UsersService.updateEmail(id, email)

          refresh.set({
            value: refresh.value,
            secure: true,
            httpOnly: true,
            sameSite: 'none',
            path: '/',
            domain: DOMAIN,
            maxAge: -1
          })
          access.set({
            value: access.value,
            secure: true,
            httpOnly: true,
            sameSite: 'none',
            path: '/',
            domain: DOMAIN,
            maxAge: -1
          })

          zoho.message(
            email,
            user.name,
            'Tu correo electrónico ha sido actualizado. Recuerda que tendrás que confirmar tu nuevo correo electrónico cuando intentes iniciar sesión por primera vez.',
            {
              link: {
                url: `${CLIENT}/account/login`,
                text: 'Ir a App' // IMPORTANT: Replace this with your app name
              }
            }
          )
        },
        {
          rateLimit: 'auth',
          updateEmailRequest: true,
          query: t.Object({
            token: t.String()
          })
        }
      )
      .patch(
        '/verify-email',
        ({ verifyData: { id } }) => {
          UsersService.verify(id)
        },
        {
          rateLimit: 'auth',
          verifyRequest: true,
          query: t.Object({
            token: t.String()
          })
        }
      )
      .get(
        '/',
        ({ user, query: { role } }) => {
          const users = models.user.findAll(user.id, role)

          return {
            users
          }
        },
        {
          rateLimit: 'default',
          auth: [ROLES.ADMIN],
          query: t.Object({
            role: Role
          })
        }
      )
      .get(
        '/clients',
        ({ user }) => {
          const users = models.user.findAll(user.id, ROLES.CLIENT)

          return {
            users
          }
        },
        {
          rateLimit: 'default',
          auth: [ROLES.DEV, ROLES.ADMIN]
        }
      )
      .get(
        '/summary/names',
        () => {
          const names = models.user.getAllClientNames()

          return {
            names
          }
        },
        {
          rateLimit: 'default',
          auth: [ROLES.ADMIN, ROLES.DEV]
        }
      )
      .get(
        '/me',
        ({ user }) => {
          const data = UsersService.getById(user.id)

          return {
            user: data
          }
        },
        {
          rateLimit: 'default',
          auth: true
        }
      )
      .get(
        '/:id',
        ({ params: { id } }) => {
          const data = UsersService.getById(id)

          return {
            user: data
          }
        },
        {
          rateLimit: 'default',
          auth: [ROLES.ADMIN, ROLES.DEV],
          params: t.Object({
            id: Uuid
          })
        }
      )
      .get(
        '/me/orders',
        ({ user: { id }, query: { limit } }) => {
          const orders = models.order.findAllByUser(id, limit)

          return {
            orders
          }
        },
        {
          rateLimit: 'default',
          auth: [ROLES.CLIENT],
          query: t.Object({
            limit: t.Optional(t.Number())
          })
        }
      )
      .get(
        '/:id/orders',
        ({ params: { id } }) => {
          const orders = models.order.findAllByUser(id)

          return {
            orders
          }
        },
        {
          rateLimit: 'default',
          auth: [ROLES.ADMIN, ROLES.DEV],
          params: t.Object({
            id: Uuid
          })
        }
      )
      .get(
        '/me/payments',
        ({ user: { id }, query: { limit } }) => {
          const payments = models.payment.findAllByUser(id, limit)

          return {
            payments
          }
        },
        {
          rateLimit: 'default',
          auth: [ROLES.CLIENT],
          query: t.Object({
            limit: t.Optional(t.Number())
          })
        }
      )
      .get(
        '/:id/payments',
        ({ params: { id } }) => {
          const payments = models.payment.findAllByUser(id)

          return {
            payments
          }
        },
        {
          rateLimit: 'default',
          auth: [ROLES.ADMIN, ROLES.DEV],
          params: t.Object({
            id: Uuid
          })
        }
      )
      .get(
        '/me/threads',
        ({ user: { id }, query: { limit, status } }) => {
          const threads = models.thread.findAllByUser(id, limit, status)

          return {
            threads
          }
        },
        {
          rateLimit: 'default',
          auth: [ROLES.CLIENT],
          query: t.Object({
            status: t.Optional(ThreadStatus),
            limit: t.Optional(
              t.Integer({
                minimum: 1,
                maximum: 10
              })
            )
          })
        }
      )
      .get(
        '/:id/threads',
        ({ params: { id }, query: { status } }) => {
          // NOTE: Consider implementing a diferent way to handle limit
          const threads = models.thread.findAllByUser(id, undefined, status)

          return {
            threads
          }
        },
        {
          rateLimit: 'default',
          auth: [ROLES.ADMIN, ROLES.DEV],
          params: t.Object({
            id: Uuid
          }),
          query: t.Object({
            status: t.Optional(ThreadStatus)
          })
        }
      )
      .post(
        '/billing-profile',
        async ({ user: { id }, body: { client }, set }) => {
          await UsersService.registerBillingProfile(id, client)

          set.status = 201
        },
        {
          rateLimit: 'auth',
          auth: [ROLES.CLIENT],
          body: t.Object({
            client: FacturaClient
          })
        }
      )
      .put(
        '/billing-profile',
        async ({ user: { id }, body: { client } }) => {
          await UsersService.updateBillingProfile(id, client)
        },
        {
          rateLimit: 'auth',
          auth: [ROLES.CLIENT],
          body: t.Object({
            client: FacturaClient
          })
        }
      )
      .delete(
        '/billing-profile',
        async ({ user: { id } }) => {
          await UsersService.deleteBillingProfile(id)
        },
        {
          rateLimit: 'auth',
          auth: [ROLES.CLIENT]
        }
      )
      .get(
        '/billing-profile',
        async ({ user: { id } }) => {
          const profile = await UsersService.getBillingProfile(id)
          return {
            profile
          }
        },
        {
          rateLimit: {
            limit: 15,
            windowMs: 5 * 60 * 1000
          },
          auth: [ROLES.CLIENT]
        }
      )
      .get(
        'billing/predefined-values',
        async () => {
          const regimes = await factura.catalog.getRegimes()

          return {
            regimes
          }
        },
        {
          rateLimit: {
            limit: 10,
            windowMs: 5 * 60 * 1000
          },
          auth: [ROLES.CLIENT]
        }
      )
      .delete(
        '/:id',
        async ({ params: { id } }) => {
          await UsersService.deactivate(id)
        },
        {
          rateLimit: {
            limit: 10,
            windowMs: 5 * 60 * 1000
          },
          auth: [ROLES.ADMIN],
          params: t.Object({
            id: Uuid
          })
        }
      )
      .get(
        '/me/secrets',
        ({ user, query: { as_receiver } }) => {
          if (as_receiver === '1') {
            const secrets = models.user.getSecretsAsReceiver(user.id)

            return {
              secrets
            }
          }

          const secrets = models.user.getSecretsAsAuthor(user.id)
          const key = UsersService.getAdminKey()

          return {
            secrets,
            key
          }
        },
        {
          rateLimit: 'default',
          auth: [ROLES.CLIENT],
          query: t.Object({
            as_receiver: t.Optional(t.Literal('1'))
          })
        }
      )
      .get(
        '/:id/secrets',
        ({ user, params: { id }, query: { as_receiver } }) => {
          if (as_receiver === '1') {
            const secrets = models.user.getSecrets(id, user.id)

            return {
              secrets
            }
          }

          const secrets = models.user.getSecrets(user.id, id)
          const key = models.user.getKey(id)

          return {
            secrets,
            key
          }
        },
        {
          rateLimit: 'default',
          auth: [ROLES.ADMIN, ROLES.DEV],
          params: t.Object({
            id: Uuid
          }),
          query: t.Object({
            as_receiver: t.Optional(t.Literal('1'))
          })
        }
      )
      .post(
        '/secrets',
        ({ user, body, set }) => {
          const data = UsersService.saveNewSecret(user, body)

          set.status = 201

          return data
        },

        {
          rateLimit: 'upload',
          auth: true,
          body: t.Object({
            label: t.String({
              minLength: 4,
              maxLength: 60
            }),
            key: t.String(),
            content: t.String({
              minLength: 4,
              maxLength: 100
            }),
            iv: t.String({
              minLength: 16,
              maxLength: 16
            }),
            receiver_id: t.Optional(Uuid)
          })
        }
      )
      .patch(
        '/secrets/:id',
        ({ user: { id: userId }, params: { id }, body: { secret } }) => {
          // NOTE: If the user isn't the author the secret will not be updated, but the request will be accepted
          models.user.updateSecret(userId, id, secret)
        },
        {
          rateLimit: 'upload',
          auth: true,
          params: t.Object({
            id: t.Integer({
              min: 1
            })
          }),
          body: t.Object({
            secret: t.String({
              minLength: 4,
              maxLength: 100
            })
          })
        }
      )
      .delete(
        '/secrets/:id',
        ({ user: { id: userId }, params: { id } }) => {
          models.user.dropSecret(userId, id)
        },
        {
          rateLimit: 'upload',
          auth: true,
          params: t.Object({
            id: t.Integer({
              min: 1
            })
          })
        }
      )
      .post(
        '/key',
        ({ user, body: { key } }) => {
          UsersService.saveNewKey(user.id, key)
        },
        {
          rateLimit: {
            limit: 5,
            windowMs: 5 * 60 * 1000
          },
          auth: true,
          body: t.Object({
            key: t.String()
          })
        }
      )
      .get(
        '/admin-key',
        () => {
          const key = UsersService.getAdminKey()
          return {
            key
          }
        },
        {
          rateLimit: 'default',
          auth: [ROLES.CLIENT]
        }
      )
      .delete(
        '/me/key',
        ({ user }) => {
          UsersService.clearKey(user.id)
        },
        {
          rateLimit: 'upload',
          auth: true
        }
      )
      .get(
        '/contract-complement',
        ({ user, query: { order_id } }) => {
          const complement = UsersService.getContractComplement(order_id, user)

          return {
            complement
          }
        },
        {
          rateLimit: 'default',
          auth: [ROLES.CLIENT, ROLES.ADMIN],
          query: t.Object({
            order_id: t.Integer({
              minimum: 1
            })
          })
        }
      )
      .delete(
        '/contract-complement',
        ({ user }) => {
          models.user.dropContractComplement(user.id)
        },
        {
          auth: [ROLES.CLIENT],
          rateLimit: {
            limit: 2,
            windowMs: 5 * 60 * 1000
          }
        }
      )
      .post(
        '/contract-complement',
        ({ user, body }) => {
          UsersService.saveContractComplement(body, user.id)
        },
        {
          auth: [ROLES.CLIENT],
          rateLimit: {
            limit: 2,
            windowMs: 5 * 60 * 1000
          },
          body: t.Object({
            legal_name: secretSchema,
            rfc: secretSchema,
            fullname: secretSchema,
            address: secretSchema,
            role: secretSchema
          })
        }
      )
  )

export default Users
