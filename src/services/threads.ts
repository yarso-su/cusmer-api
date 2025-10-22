import { ROLES, THREAD_STATUSES } from '@/lib/constants'
import { ForbiddenError, NotFoundError } from '@/lib/errors'
import models from '@/models/sqlite'
import { logger } from './logger'
import { r2 } from '@/lib/r2'

class ThreadsService {
  static add(data: {
    user_id: string
    name: string
    type: number
    order_id?: number
  }): { id: number } {
    const { order_id, ...thread } = data

    const res = models.db.transaction(() => {
      const threadId = models.thread.save(thread)

      if (order_id) {
        models.thread.saveOrder({ thread_id: threadId, service_id: order_id })
      }

      return threadId
    })

    return {
      id: res()
    }
  }

  static async update(
    id: number,
    data: {
      name: string
      type: number
      status: number
    }
  ) {
    const status = models.thread.getStatusById(id)
    if (!status) throw new NotFoundError('Thread not found')

    if (status === THREAD_STATUSES.CLOSED) {
      throw new ForbiddenError('El hilo está cerrado')
    }

    models.thread.update(id, data)

    if (data.status === THREAD_STATUSES.CLOSED) {
      const attachments = models.thread.getAttachments(id)

      await r2.dropAttachments(attachments.map(a => a.filename))
      models.thread.dropAttachments(id)
    }
  }

  static findById(id: number) {
    const thread = models.thread.findById(id)
    if (!thread) throw new NotFoundError('No se encontro el hilo')

    const orderId = models.thread.getOrderById(id)

    return { ...thread, orderId }
  }

  static saveMessage(
    thread_id: number,
    user_id: string,
    content: string
  ):
    | {
        success: true
        createdAt: string
      }
    | { success: false } {
    try {
      const createdAt = models.thread.saveMessage({
        thread_id,
        user_id,
        content
      })

      return {
        success: true,
        createdAt
      }
    } catch (err) {
      return {
        success: false
      }
    }
  }

  static getMessages(
    threadId: number
  ): { success: true; messages: any[] } | { success: false } {
    try {
      const messages = models.thread.getMessages(threadId)

      return {
        success: true,
        messages
      }
    } catch (err) {
      logger.internal(`ThreadsService.getMessages [${threadId}]`, err)

      return {
        success: false
      }
    }
  }

  static setOrder(id: number, orderId: number) {
    const status = models.thread.getStatusById(id)
    if (!status) throw new NotFoundError('No se encontro el hilo')

    if (status !== THREAD_STATUSES.OPEN) {
      throw new ForbiddenError(
        'El estado del hilo no permite crear una relacionar con un servicio'
      )
    }

    models.thread.setOrder({ thread_id: id, service_id: orderId })
  }

  static generateAttachmentsPresignedUrl(
    user: { id: string; role: number },
    threadId: number,
    type: { ext: string; mime: string }
  ) {
    const status = models.thread.getStatusById(threadId)
    if (!status) throw new NotFoundError('No se encontro el hilo')

    if (status !== THREAD_STATUSES.OPEN) {
      throw new ForbiddenError(
        'El estado del hilo no permite adjuntar archivos'
      )
    }

    if (user.role === ROLES.CLIENT) {
      const userId = models.thread.getUserId(threadId)
      if (userId !== user.id) {
        throw new ForbiddenError('No tienes permisos para adjuntar archivos')
      }
    }

    const count = models.thread.getAttachmentsCount(threadId)
    if (count >= 15) {
      throw new ForbiddenError('Este hilo ha alcanzado el límite de archivos')
    }

    const key = `${crypto.randomUUID()}.${type.ext}`
    const url = r2.getPresignedUrl(key, type)

    return {
      url,
      key
    }
  }

  static addAttachment(
    user: { id: string; role: number },
    threadId: number,
    filename: string
  ) {
    const status = models.thread.getStatusById(threadId)
    if (!status) throw new NotFoundError('No se encontro el hilo')

    if (status !== THREAD_STATUSES.OPEN) {
      throw new ForbiddenError(
        'El estado del hilo no permite adjuntar archivos'
      )
    }

    if (user.role === ROLES.CLIENT) {
      const userId = models.thread.getUserId(threadId)
      if (userId !== user.id) {
        throw new ForbiddenError('No tienes permisos para adjuntar archivos')
      }
    }

    const count = models.thread.getAttachmentsCount(threadId)
    if (count >= 15) {
      throw new ForbiddenError('Este hilo ha alcanzado el límite de archivos')
    }

    return models.thread.saveAttachment({
      filename,
      user_id: user.id,
      thread_id: threadId
    })
  }

  static async removeAttachment(
    user: { id: string; role: number },
    threadId: number,
    filename: string
  ) {
    const status = models.thread.getStatusById(threadId)
    if (!status) throw new NotFoundError('No se encontro el hilo')

    if (status !== THREAD_STATUSES.OPEN) {
      throw new ForbiddenError(
        'El estado del hilo no permite eliminar archivos adjuntos'
      )
    }

    if (user.role === ROLES.CLIENT) {
      const userId = models.thread.getAttachmentUserId(filename)
      if (userId !== user.id) {
        throw new ForbiddenError(
          'No tienes permisos para eliminar este archivo'
        )
      }
    }

    await r2.dropAttachment(filename)
    models.thread.dropAttachment(filename)
  }

  static getAttachments(user: { id: string; role: number }, threadId: number) {
    if (user.role === ROLES.CLIENT) {
      const userId = models.thread.getUserId(threadId)
      if (userId !== user.id) {
        throw new ForbiddenError(
          'No tienes permisos para eliminar este archivo'
        )
      }
    }

    const attachments = models.thread.getAttachments(threadId)
    return attachments.map(a => ({
      filename: a.filename,
      belongsToUser: a.user_id === user.id,
      createdAt: a.created_at
    }))
  }
}

export default ThreadsService
