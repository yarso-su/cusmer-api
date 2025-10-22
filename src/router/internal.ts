import { ROLES } from '@/lib/constants'
import { SettingsService } from '@/lib/elysia_services'
import { rateLimit } from '@/lib/rate-limiter'
import models from '@/models/sqlite'
import Elysia, { t } from 'elysia'

const Internal = new Elysia({ name: 'Service.Router.Internal' })
  .use(SettingsService)
  .use(rateLimit)
  .group('/internal', app =>
    app
      .post(
        '/operating-costs',
        ({ body }) => {
          const id = models.internal.saveOperatingCost(body)
          return {
            id
          }
        },
        {
          auth: [ROLES.ADMIN],
          body: t.Object({
            amount: t.Integer({
              min: 1,
              max: 10000
            }),
            note: t.String({
              min: 4,
              max: 140
            })
          }),
          rateLimit: 'upload'
        }
      )
      .delete(
        '/operating-costs/:id',
        ({ params: { id } }) => {
          models.internal.dropOperatingCost(id)
        },
        {
          auth: [ROLES.ADMIN],
          params: t.Object({
            id: t.Integer({
              min: 1
            })
          }),
          rateLimit: 'upload'
        }
      )
      .get(
        '/operating-costs',
        () => {
          const costs = models.internal.getOperatingCosts()
          return {
            costs
          }
        },
        {
          auth: [ROLES.ADMIN, ROLES.DEV],
          rateLimit: 'default'
        }
      )
  )

export default Internal
