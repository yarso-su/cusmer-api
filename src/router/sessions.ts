import { SettingsService } from '@/lib/elysia_services'
import { Email, Password, Uuid } from '@/lib/schemas'
import Elysia, { t } from 'elysia'
import SessionsService from '@/services/sessions'
import { DOMAIN, ROLES } from '@/lib/constants'
import { newExp } from '@/lib/utils'
import { zoho } from '@/lib/zoho'
import models from '@/models/sqlite'
import { rateLimit } from '@/lib/rate-limiter'

const Sessions = new Elysia({ name: 'Service.Router.Sessions' })
  .use(SettingsService)
  .use(rateLimit)
  .group('/sessions', app =>
    app
      .get(
        '/handshake',
        ({ user }) => {
          return {
            role: user.role
          }
        },
        {
          rateLimit: 'api',
          auth: true
        }
      )
      .post(
        '/',
        async ({ body: { email, password }, set }) => {
          const { code, user } = await SessionsService.login(email, password)
          await zoho.code(email, user.name, code.value)

          set.status = 201

          return code.id
        },
        {
          rateLimit: 'auth',
          body: t.Object({
            email: Email,
            password: Password
          })
        }
      )
      .post(
        '/verification-code',
        async ({ body: { id }, set }) => {
          const { code, user } = SessionsService.regenerateCode(id)

          // NOTE: Consider not waiting for the email to be sent
          await zoho.code(user.email, user.name, code.value)

          set.status = 201

          return code.id
        },
        {
          rateLimit: 'auth',
          body: t.Object({
            id: Uuid
          })
        }
      )
      .patch(
        '/',
        async ({
          body: { code },
          query: { code_id },
          refreshJwt,
          cookie: { refresh, billing_required }
        }) => {
          const {
            session,
            user: { billingRequired, ...user }
          } = SessionsService.verify({
            id: code_id,
            value: code
          })
          const token = await refreshJwt.sign({
            id: session.id,
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

          if (billingRequired) {
            billing_required.set({
              value: '1',
              secure: true,
              httpOnly: true,
              sameSite: 'none',
              path: '/',
              domain: DOMAIN,
              maxAge: 60 * 60 * 24 * 5
            })
          }

          return { user }
        },
        {
          rateLimit: 'auth',
          body: t.Object({
            code: t.String({
              trim: true,
              maxLength: 6,
              minLength: 6
            })
          }),
          query: t.Object({
            code_id: Uuid
          })
        }
      )
      .delete(
        '/',
        ({ user, cookie: { refresh, access } }) => {
          models.session.deleteAll(user.id)

          access.set({
            value: access.value,
            secure: true,
            httpOnly: true,
            sameSite: 'none',
            path: '/',
            domain: DOMAIN,
            maxAge: -1
          })
          refresh.set({
            value: refresh.value,
            secure: true,
            httpOnly: true,
            sameSite: 'none',
            path: '/',
            domain: DOMAIN,
            maxAge: -1
          })
        },
        {
          rateLimit: 'upload',
          auth: true
        }
      )
      .delete(
        '/:user_id',
        ({ params: { user_id } }) => {
          models.session.deleteAll(user_id)
        },
        {
          rateLimit: 'upload',
          auth: [ROLES.ADMIN],
          params: t.Object({
            user_id: Uuid
          })
        }
      )
  )

export default Sessions
