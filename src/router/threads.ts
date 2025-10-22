import {
  ADMIN_EMAIL,
  CLIENT,
  ROLES,
  SECRETS,
  THREAD_STATUSES
} from '@/lib/constants'
import { SettingsService } from '@/lib/elysia_services'
import { rateLimit } from '@/lib/rate-limiter'
import { zoho } from '@/lib/zoho'
import { ThreadStatus, ThreadType } from '@/lib/schemas'
import { newExp } from '@/lib/utils'
import models from '@/models/sqlite'
import { logger } from '@/services/logger'
import ThreadsService from '@/services/threads'
import jwt from '@elysiajs/jwt'
import Elysia, { t } from 'elysia'

interface ChatData {
  thread: {
    id: number
    owner: {
      id: string
      name: string
      email: string
    }
  }
  user: {
    id: string
    name: string
    email: string
    role: number
    verified: boolean
    active: boolean
  }
}

const Threads = new Elysia({ name: 'Service.Router.Threads' })
  .use(SettingsService)
  .use(
    jwt({
      name: 'chatJwt',
      secret: SECRETS.CHAT,
      schema: t.Object({
        thread: t.Integer({
          minimum: 1
        }),
        user: t.String({
          format: 'uuid'
        })
      }),
      exp: '2m'
    })
  )
  .use(rateLimit)
  .group('/threads', app =>
    app
      .post(
        '/',
        ({ user, body }) => {
          const res = ThreadsService.add({
            ...body,
            user_id: user.id
          })

          return res
        },
        {
          rateLimit: {
            limit: 5,
            windowMs: 3 * 60 * 1000
          },
          auth: [ROLES.CLIENT],
          body: t.Object({
            name: t.String({
              trim: true,
              minLength: 4,
              maxLength: 60
            }),
            type: ThreadType,
            order_id: t.Optional(
              t.Integer({
                minimum: 1
              })
            )
          })
        }
      )
      .put(
        '/:id',
        async ({ params: { id }, body }) => {
          await ThreadsService.update(id, body)
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
            name: t.String({
              trim: true,
              minLength: 4,
              maxLength: 60
            }),
            type: ThreadType,
            status: ThreadStatus
          })
        }
      )
      .get(
        '/',
        ({ query: { limit, status } }) => {
          const threads = models.thread.findAll(limit, status)

          return {
            threads
          }
        },
        {
          rateLimit: 'default',
          auth: [ROLES.ADMIN, ROLES.DEV],
          query: t.Object({
            limit: t.Integer({ minimum: 1, maximum: 15 }),
            status: t.Optional(ThreadStatus)
          })
        }
      )
      .get(
        '/by-status/:status/:page',
        ({ params: { status, page } }) => {
          const threads = models.thread.findAllByStatus(status, page)

          return {
            threads
          }
        },
        {
          rateLimit: 'default',
          auth: [ROLES.ADMIN, ROLES.DEV],
          params: t.Object({
            status: ThreadStatus,
            page: t.Integer({ minimum: 1 })
          })
        }
      )
      .ws('/o/chat', {
        async open(ws) {
          try {
            const protocols = ws.data.request.headers.get(
              'sec-websocket-protocol'
            )
            const tokenProtocol = protocols
              ?.split(',')
              .find(p => p.trim().startsWith('token-'))

            const token = tokenProtocol?.replace('token-', '')
            const content = await ws.data.chatJwt.verify(token)
            if (!content) {
              ws.close(1008, 'Sesión expirada')
              return
            }

            const user = models.user.findById(content.user)
            if (!user) {
              ws.close(1008, 'Sesión expirada')
              return
            }

            const owner = models.thread.getOwner(content.thread)
            if (!owner) {
              ws.close(1008, 'Sesión expirada')
              return
            }

            const data = ws.data as any
            data.chat = {
              thread: {
                id: content.thread,
                owner
              },
              user: { ...user, id: content.user }
            }

            ws.subscribe(`chat:${content.thread}`)
          } catch (err) {
            ws.close(1008, 'Error inesperado')
          }
        },

        message(ws, message) {
          try {
            const data = ws.data as any

            if (
              !message ||
              typeof message !== 'string' ||
              message.length > 240
            ) {
              ws.send({ type: 'error', message: 'Mensaje inválido' })
              return
            }

            const now = Date.now()
            if (now - (data.lastMessageTime || 0) < 1000) {
              ws.send({ type: 'error', message: 'Muy rápido' })
              return
            }

            data.lastMessageTime = now

            const chat = data.chat as ChatData
            const result = ThreadsService.saveMessage(
              chat.thread.id,
              chat.user.id,
              message
            )
            if (!result.success) {
              ws.send({ type: 'error', message: 'Error al guardar el mensaje' })
              return
            }

            const { createdAt } = result
            const content = {
              type: 'new_message',
              message: {
                content: message,
                user: {
                  id: chat.user.id,
                  name: chat.user.name
                },
                createdAt
              }
            }
            ws.send(content)
            ws.publish(`chat:${chat.thread}`, content)

            if (data.isFirstMessage === false) return
            data.isFirstMessage = false

            const senderIsOwner = chat.user.id === chat.thread.owner.id

            zoho.message(
              senderIsOwner ? ADMIN_EMAIL : chat.thread.owner.email,
              senderIsOwner ? 'Administrator' : chat.thread.owner.name,
              'Parece que un hilo esta recibiendo actualizaciones.',
              {
                link: {
                  text: 'Ir al hilo',
                  url: senderIsOwner
                    ? `${CLIENT}/su/threads/${chat.thread.id}`
                    : `${CLIENT}/platform/threads/${chat.thread.id}`
                }
              }
            )
          } catch (err) {
            ws.close(1008, 'Error inesperado')
          }
        },
        close(ws) {
          try {
            const data = ws.data as any
            const chat = data.chat as ChatData

            if (chat?.thread?.id) {
              ws.unsubscribe(`chat:${chat.thread.id}`)
            }

            Object.assign(data, {
              chat: null,
              isFirstMessage: null,
              lastMessageTime: null
            })
          } catch (err) {
            logger.internal('Threads.ws.close', err)
          }
        }
      })
      .get(
        '/:id',
        async ({ user, params: { id }, chatJwt }) => {
          const thread = ThreadsService.findById(id)
          const attachments = ThreadsService.getAttachments(user, id)
          const messages = models.thread.getMessages(id)

          let token
          if (thread.status === THREAD_STATUSES.OPEN) {
            token = await chatJwt.sign({
              thread: id,
              user: user.id,
              exp: newExp(60 * 2)
            })
          }

          return {
            thread,
            attachments,
            messages,
            token,
            userId: user.id
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
      .post(
        '/:id/order',
        ({ params: { id }, body: { order_id: orderId } }) => {
          ThreadsService.setOrder(id, orderId)
        },
        {
          rateLimit: 'upload',
          auth: [ROLES.CLIENT],
          params: t.Object({
            id: t.Integer({
              minimum: 1
            })
          }),
          body: t.Object({
            order_id: t.Integer({
              minimum: 1
            })
          })
        }
      )
      .delete(
        '/:id/order',
        ({ params: { id } }) => {
          models.thread.removeOrder(id)
        },
        {
          rateLimit: 'upload',
          auth: [ROLES.CLIENT],
          params: t.Object({
            id: t.Integer({
              minimum: 1
            })
          })
        }
      )
      .post(
        '/:id/attachments/presigned-url',
        ({ user, params: { id }, body }) => {
          return ThreadsService.generateAttachmentsPresignedUrl(user, id, body)
        },
        {
          rateLimit: 'upload',
          auth: true,
          params: t.Object({
            id: t.Integer({
              minimum: 1
            })
          }),
          body: t.Object({
            ext: t.String({
              trim: true,
              minLength: 1,
              maxLength: 10
            }),
            mime: t.String({
              trim: true,
              minLength: 1,
              maxLength: 24
            })
          })
        }
      )
      .post(
        '/:id/attachments',
        ({ user, params: { id }, query: { filename } }) => {
          const created_at = ThreadsService.addAttachment(user, id, filename)

          return {
            created_at
          }
        },
        {
          rateLimit: 'upload',
          auth: true,
          params: t.Object({
            id: t.Integer({
              minimum: 1
            })
          }),
          query: t.Object({
            filename: t.String({
              trim: true,
              minLength: 1,
              maxLength: 120
            })
          })
        }
      )
      .delete(
        '/:id/attachments',
        async ({ user, params: { id }, query: { filename } }) => {
          await ThreadsService.removeAttachment(user, id, filename)
        },
        {
          rateLimit: 'upload',
          auth: true,
          params: t.Object({
            id: t.Integer({
              minimum: 1
            })
          }),
          query: t.Object({
            filename: t.String({
              trim: true,
              minLength: 1,
              maxLength: 120
            })
          })
        }
      )
      .get(
        '/:id/attachments',
        async ({ user, params: { id } }) => {
          const attachments = ThreadsService.getAttachments(user, id)

          return {
            attachments
          }
        },
        {
          rateLimit: 'upload',
          auth: true,
          params: t.Object({
            id: t.Integer({
              minimum: 1
            })
          })
        }
      )
  )

export default Threads
