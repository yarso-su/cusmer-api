import {
  ADMIN_EMAIL,
  CLIENT,
  ROLES,
  VALID_REGIMENS_FOR_GO3
} from '@/lib/constants'
import { ForbiddenError, ValidationError } from '@/lib/errors'
import { factura } from '@/lib/factura'
import { IClient, IForeignClient } from '@/lib/factura/client'
import { zoho } from '@/lib/zoho'
import { stripeService } from '@/lib/stripe'
import { LEGAL_DOCUMENTS_ACCEPTED_MESSAGE } from '@/lib/utils'
import models from '@/models/sqlite'
import { NotFoundError } from 'elysia'
import { logger } from './logger'
import { SQLiteError } from 'bun:sqlite'

interface Secret {
  key: string
  content: string
  iv: string
}

class UsersService {
  static async register(
    data: {
      name: string
      password: string
      termsAndPoliciesAccepted: boolean
    },
    secure: {
      email: string
      role: number
    },
    userAgent: string
  ): Promise<{ user: { id: string; name: string; email: string } }> {
    if (!data.termsAndPoliciesAccepted) {
      throw new ForbiddenError('Debes aceptar los documentos legales')
    }

    const { name, password } = data

    const hash = await Bun.password.hash(password)
    const user = {
      name,
      email: secure.email,
      role: secure.role,
      password_hash: hash
    }

    let stripe: any
    if (secure.role === ROLES.CLIENT) {
      stripe = await stripeService.createCustomer(secure.email, name)
    }

    const save = models.db.transaction(() => {
      const userId = models.user.create(user)
      models.user.saveConsents(userId, userAgent)

      if (typeof stripe === 'string') {
        models.user.createStripeCustomer(userId, stripe)
      }

      return userId
    })

    const id = save()

    const sent = zoho.message(
      secure.email,
      name,
      LEGAL_DOCUMENTS_ACCEPTED_MESSAGE
    )
    if (!sent) {
      logger.internal(
        `UserService.register [${secure.email}]`,
        'Email with legal consents not sent'
      )
    }

    return {
      user: {
        id,
        name,
        email: secure.email
      }
    }
  }

  static async resetPassword(id: string, password: string) {
    const hash = await Bun.password.hash(password)
    const success = models.user.setPassword(id, hash)
    if (!success) throw new NotFoundError('No se encontro el usuario')

    // NOTE: Consider using a transaction
    models.session.deleteAll(id)

    const newSessionId = models.session.create(id)
    models.session.verify(newSessionId)

    return newSessionId
  }

  static updateEmail(id: string, email: string) {
    const name = models.user.getNameById(id)
    if (!name) throw new NotFoundError('No se encontro el usuario')

    models.user.setEmail(id, email)
    models.session.deleteAll(id)

    return { user: { name } }
  }

  static verify(id: string) {
    if (!models.user.verifyEmail(id)) throw new NotFoundError('Algo salió mal')
  }

  static getById(id: string): {
    name: string
    email: string
    verified: boolean
    role: number
    active: boolean
  } {
    const user = models.user.findById(id)
    if (!user) throw new NotFoundError('No se encontro el usuario')

    return user
  }

  static getByEmail(email: string): {
    user: { id: string; name: string }
  } {
    const user = models.user.findByEmail(email)
    if (!user) throw new NotFoundError('No se encontro el usuario')

    return {
      user: {
        id: user.id,
        name: user.name
      }
    }
  }

  static async registerBillingProfile(id: string, user: IClient) {
    const profile = models.user.getFacturaClient(id)

    if (profile) {
      throw new ForbiddenError(
        'Ya existe un perfil de facturación para este usuario'
      )
    }

    const profileId = await factura.client.register(user)
    models.user.saveFacturaClient({
      user_id: id,
      factura_client_id: profileId,
      is_foreign: false,
      cfdi_use: VALID_REGIMENS_FOR_GO3.includes(user.regimen) ? 'G03' : 'S01' // NOTE: No fiscal obligations
    })
  }

  static async registerForeignBillingProfile(id: string, user: IForeignClient) {
    const profile = models.user.getFacturaClient(id)

    if (profile) {
      throw new ForbiddenError(
        'Ya existe un perfil de facturación para este usuario'
      )
    }

    const profileId = await factura.client.registerForeign(user)
    models.user.saveFacturaClient({
      user_id: id,
      factura_client_id: profileId,
      is_foreign: true,
      cfdi_use: 'S01' // NOTE: No fiscal obligations
    })
  }

  static async updateBillingProfile(id: string, user: IClient) {
    const profile = models.user.getFacturaClient(id)
    if (!profile)
      throw new NotFoundError('No se encontro el perfil de facturación')

    if (profile.is_foreign) throw new ForbiddenError('Operación no permitida')

    await factura.client.update(profile.factura_client_id, user)
  }

  static async updateForeignBillingProfile(id: string, user: IForeignClient) {
    const profile = models.user.getFacturaClient(id)
    if (!profile)
      throw new NotFoundError('No se encontro el perfil de facturación')

    if (!profile.is_foreign) throw new ForbiddenError('Operación no permitida')

    await factura.client.updateForeign(profile.factura_client_id, user)
  }

  // TODO: Review this behaviour
  static async deleteBillingProfile(id: string) {
    const profile = models.user.getFacturaClient(id)
    if (!profile) {
      throw new NotFoundError('No se encontro el perfil de facturación')
    }

    await factura.client.delete(profile.factura_client_id)
    models.user.deleteFacturaClient(id)
  }

  static async getBillingProfile(id: string) {
    const profile = models.user.getFacturaClient(id)
    if (!profile) {
      return null
    }

    const data = await factura.client.get(profile.factura_client_id)

    return {
      client: data,
      foreign: profile.is_foreign
    }
  }

  static async deactivate(id: string) {
    const undoneOrders = models.order.getUndoneCount(id)
    if (undoneOrders > 0)
      throw new ForbiddenError(
        'No se puede desactivar el usuario, hay servicios pendientes'
      )

    const undoneThreads = models.thread.getUndoneCount(id)
    if (undoneThreads > 0)
      throw new ForbiddenError(
        'No se puede desactivar el usuario, hay hilos pendientes'
      )

    const stripeCustomerId = models.user.getStripeCustomerId(id)
    if (stripeCustomerId) {
      await stripeService.deleteCustomer(stripeCustomerId)
      models.user.dropStripeCustomer(id)
    }

    const profile = models.user.getFacturaClient(id)
    if (profile) {
      await factura.client.delete(profile.factura_client_id)
      models.user.deleteFacturaClient(id)
    }

    models.user.deactivate(id)
  }

  static getAdminKey() {
    const id = models.user.getIdByEmail(ADMIN_EMAIL)
    if (!id) {
      throw new NotFoundError(
        'Parece que faltan elementos en la configuración, Reporta con Soporte técnico'
      )
    }

    const key = models.user.getKey(id)
    if (!key) {
      throw new ForbiddenError(
        'Parece que faltan elementos en la configuración, Reporta con Soporte técnico'
      )
    }

    return key
  }

  static saveNewKey(id: string, key: string) {
    try {
      models.user.saveKey(id, key)
    } catch (err: any) {
      if (
        err instanceof SQLiteError &&
        err.code === 'SQLITE_CONSTRAINT_UNIQUE'
      ) {
        throw new ForbiddenError(
          'Parece que tu cuenta ya tiene un dispositivo registrado. Reporta con Soporte técnico'
        )
      }

      throw err
    }
  }

  static clearKey(id: string) {
    const clear = models.db.transaction(() => {
      models.user.dropKey(id)
      models.user.clearSecrets(id)
    })

    clear()
  }

  static saveNewSecret(
    user: { id: string; role: number },
    secret: {
      label: string
      key: string
      content: string
      iv: string
      receiver_id?: string
    }
  ) {
    if (user.role === ROLES.CLIENT && secret.receiver_id !== undefined) {
      throw new ForbiddenError('Parece que estás intentando algo malo') // NOTE: This should never happen on frontend
    }

    if (user.role === ROLES.CLIENT) {
      const adminId = models.user.getIdByEmail(ADMIN_EMAIL)
      if (!adminId) {
        throw new Error(
          'Parece que faltan elementos en la configuración, Reporta con Soporte técnico'
        )
      }

      const data = models.user.saveSecret({
        ...secret,
        author_id: user.id,
        receiver_id: adminId
      })

      const receiver = models.user.findById(adminId)
      if (!receiver) throw new NotFoundError('No se encontro el usuario') // NOTE: This should never happen on frontend

      zoho.message(
        receiver.email,
        receiver.name,
        'Se ha registrado una clave nueva.',
        {
          link: {
            url: `${CLIENT}/su/users/${user.id}/secrets`,
            text: 'Revisar claves'
          }
        }
      )

      return data
    }

    if (secret.receiver_id === undefined) {
      throw new ValidationError('Hacen falta datos')
    }

    const data = models.user.saveSecret({
      ...secret,
      author_id: user.id,
      receiver_id: secret.receiver_id
    })

    const receiver = models.user.findById(secret.receiver_id)
    if (!receiver) throw new NotFoundError('No se encontro el usuario') // NOTE: This should never happen on frontend

    zoho.message(
      receiver.email,
      receiver.name,
      'Se ha registrado una clave nueva para tu cuenta.',
      {
        link: {
          url: `${CLIENT}/platform/secrets`,
          text: 'Revisar claves'
        }
      }
    )

    return data
  }

  static saveContractComplement(
    secrets: Record<'legal_name' | 'rfc' | 'fullname' | 'address', Secret>,
    userId: string
  ) {
    const adminId = models.user.getIdByEmail(ADMIN_EMAIL)
    if (!adminId) {
      throw new Error(
        'Parece que faltan elementos en la configuración, Reporta con Soporte técnico.'
      )
    }

    const data = Object.keys(secrets).map(key => {
      const secret =
        secrets[key as 'legal_name' | 'rfc' | 'fullname' | 'address']

      return {
        label: `cc_${key}`,
        key: secret.key,
        content: secret.content,
        iv: secret.iv,
        author_id: userId,
        receiver_id: adminId
      }
    })

    models.user.saveContractComplement(data)
  }

  static getContractComplement(
    orderId: number,
    user: { id: string; role: number }
  ) {
    const order = models.order.findByIdSummary(orderId)
    if (!order) throw new NotFoundError('No se encontro el servicio')

    if (user.role === ROLES.CLIENT && user.id !== order.user_id) {
      throw new ForbiddenError('No tienes acceso a este servicio')
    }

    const adminId = models.user.getIdByEmail(ADMIN_EMAIL)
    if (!adminId) {
      throw new Error(
        'Parece que faltan elementos en la configuración, Reporta con Soporte técnico'
      )
    }

    const data = models.user.getContractComplement(order.user_id, adminId)

    return data
  }
}

export default UsersService
