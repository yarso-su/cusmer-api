import {
  ORDER_INMUTABLE_STATUS as INMUTABLE,
  ORDER_STATUSES as STATUS,
  ROLES,
  ADMIN_EMAIL
} from '@/lib/constants'
import { ForbiddenError, NotFoundError } from '@/lib/errors'
import models from '@/models/sqlite'
import { SQLiteError } from 'bun:sqlite'

class OrdersService {
  static add(newOrder: {
    user_id: string
    name: string
    description: string
    tag: string
    duration_weeks: number
    payment_installments: number
    is_recurring: boolean
  }): {
    user: { name: string; email: string }
    order: { id: number | BigInt }
  } {
    if (
      newOrder.is_recurring &&
      (newOrder.duration_weeks !== 4 || newOrder.payment_installments !== 1)
    ) {
      throw new ForbiddenError(
        'Los servicios recurrentes solo pueden tener 4 semanas de duración y 1 pago fijos'
      )
    }

    if (
      newOrder.payment_installments > Math.floor(newOrder.duration_weeks / 2)
    ) {
      throw new ForbiddenError('Los pagos no son válidos para la duración dada')
    }

    const user = models.user.findById(newOrder.user_id)
    if (!user) throw new NotFoundError('No se encontro el usuario')
    if (user.role !== ROLES.CLIENT) {
      throw new ForbiddenError('Solo los clientes pueden poseer servicios')
    }

    const orderId = models.order.create(newOrder)

    return {
      user: {
        name: user.name,
        email: user.email
      },
      order: {
        id: orderId
      }
    }
  }

  static update(
    id: number,
    data: {
      name: string
      description: string
      tag: string
      duration_weeks: number
      payment_installments: number
      portfolio_consent: boolean
      is_recurring: boolean
    }
  ) {
    const order = models.order.findByIdSummary(id)
    if (!order) throw new NotFoundError('No se encontro el servicio')
    if (order.status !== STATUS.PLANNING) {
      throw new ForbiddenError('El servicio no es modificable')
    }

    if (
      data.is_recurring &&
      (data.duration_weeks !== 4 || data.payment_installments !== 1)
    ) {
      throw new ForbiddenError(
        'Los servicios con pagos recurrentes deben tener 4 semanas de duración y 1 pago fijos'
      )
    }

    if (data.payment_installments > Math.floor(data.duration_weeks / 2)) {
      throw new ForbiddenError(
        'La cantidad de pagos no es válida para la duración dada.'
      )
    }

    models.order.update(id, data)
  }

  static updateStatus(id: number, newStatus: number) {
    const order = models.order.findByIdSummary(id)
    if (!order) throw new NotFoundError('No se encontro el servicio')

    if (newStatus === order.status) return

    if (INMUTABLE.includes(order.status)) {
      throw new ForbiddenError('El servicio no es modificable')
    }

    if (
      order.status === STATUS.PLANNING &&
      newStatus !== STATUS.PAYMENT_REQUIRED
    ) {
      throw new ForbiddenError(
        'El servicio necesita pasar al menos una vez por el estado "Pago requerido"'
      )
    }

    if (
      newStatus === STATUS.PAYMENT_REQUIRED &&
      order.status !== STATUS.PLANNING
    ) {
      throw new ForbiddenError(
        'Solo puedes cambiar el estado a "Pago requerido" desde "Planeación"'
      )
    }

    if (order.status === STATUS.PLANNING) {
      const itemsCount = models.order.getItemsCountById(id)

      if (itemsCount < 1) {
        throw new ForbiddenError(
          'El servicio necesita tener al menos un item definido antes de poder ser actualizado'
        )
      }

      const contract = models.order.getContract(id)
      if (!contract) {
        throw new ForbiddenError(
          'El servicio necesita tener un contrato definido antes de poder ser actualizado'
        )
      }
    }

    if (
      newStatus === STATUS.PLANNING &&
      order.status !== STATUS.PAYMENT_REQUIRED
    ) {
      throw new ForbiddenError(
        'Solo puedes regresar al estado de "Planeación" desde "Pago requerido"'
      )
    }

    if (
      order.status === STATUS.PAYMENT_REQUIRED &&
      newStatus !== STATUS.PLANNING
    ) {
      throw new ForbiddenError(
        'El servicio no puede saltarse el estado "Pago requerido"'
      )
    }

    if (
      order.status === STATUS.PAYMENT_REQUIRED &&
      newStatus === STATUS.PLANNING
    ) {
      const paymentsCount = models.order.getPaymentsCount(id)
      if (paymentsCount > 0) {
        throw new ForbiddenError(
          'El servicio ya tiene pagos registrados y no puede cambiar de estado a "Planeación"'
        )
      }
    }

    models.order.setStatus(id, newStatus)
  }

  static setDiscount(
    id: number,
    discount: {
      percentage: number
      description: string
      disposable: boolean
    }
  ): { user: { name: string; email: string } } {
    const order = models.order.findByIdSummary(id)
    if (!order) throw new NotFoundError('No se encontro el servicio')

    if (
      order.status !== STATUS.PLANNING ||
      (order.is_recurring && INMUTABLE.includes(order.status))
    ) {
      throw new ForbiddenError(
        'El estado actual del servicio no permite añadir un descuento'
      )
    }

    const update = models.db.transaction(() => {
      models.order.deleteDiscount(id)
      models.order.createDiscount({
        ...discount,
        service_id: id
      })
    })

    update()

    const user = models.user.findById(order.user_id)
    if (!user) throw new NotFoundError('No se encontro el usuario')

    return {
      user: {
        name: user.name,
        email: user.email
      }
    }
  }

  static removeDiscount(id: number) {
    const status = models.order.getStatusById(id)
    if (!status) throw new NotFoundError('No se encontro el servicio')

    if (status !== STATUS.PLANNING) {
      throw new ForbiddenError('El servicio no es modificable')
    }

    const discount = models.order.getDiscount(id)
    if (!discount) throw new ForbiddenError('No hay un descuento activo')

    models.order.deleteDiscount(id)
  }

  static addItem(item: {
    service_id: number
    name: string
    description: string
    type: number
    cost: number
  }): number | BigInt {
    const status = models.order.getStatusById(item.service_id)
    if (!status) throw new NotFoundError('No se encontro el servicio')

    if (status !== STATUS.PLANNING) {
      throw new ForbiddenError('El servicio no es modificable')
    }

    return models.order.createItem(item)
  }

  static updateItem(
    itemId: number,
    data: {
      name: string
      description: string
      type: number
      cost: number
    }
  ) {
    const orderId = models.order.getIdByItemId(itemId)
    if (!orderId) throw new NotFoundError('No se encontro el item')

    const status = models.order.getStatusById(orderId)
    if (!status) throw new NotFoundError('No se encontro el servicio')

    if (status !== STATUS.PLANNING) {
      throw new ForbiddenError('El servicio no es modificable')
    }

    models.order.updateItem(itemId, data)
  }

  static removeItem(itemId: number) {
    const orderId = models.order.getIdByItemId(itemId)
    if (!orderId) throw new NotFoundError('No se encontro el item')

    const status = models.order.getStatusById(orderId)
    if (!status) throw new NotFoundError('No se encontro el servicio')

    if (status !== STATUS.PLANNING) {
      throw new ForbiddenError('El servicio no es modificable')
    }

    models.order.deleteItem(itemId)
  }

  static checkIfExists(id: number) {
    if (!models.order.checkIfExists(id))
      throw new NotFoundError('No se encontro el servicio')
  }

  static getById(id: number, user: { id: string; role: number }) {
    const order = models.order.findById(id)
    if (!order) throw new NotFoundError('No se encontro el servicio')

    // NOTE: Could be replaced with a pre-query to only fetch the user id
    if (user.role === ROLES.CLIENT && order.user_id !== user.id) {
      throw new ForbiddenError('No tienes acceso a este servicio')
    }

    const items = models.order.getItems(id)

    const {
      user_id,
      user_name,
      discount_percentage,
      discount_description,
      ...rest
    } = order

    const content = {
      ...rest,
      user: {
        id: user_id,
        name: user_name
      },
      discount:
        discount_percentage && discount_description
          ? {
              percentage: discount_percentage,
              description: discount_description
            }
          : undefined,
      items
    }

    return content
  }

  static getNameById(id: number, userId: string) {
    const name = models.order.getNameById(id, userId)
    if (!name) throw new NotFoundError('No se encontro el servicio')

    return name
  }

  static getStatusById(id: number) {
    // NOTE: We decided to not validate the user ownership of the service
    const status = models.order.getStatusById(id)
    if (!status) throw new NotFoundError('No se encontro el servicio')

    return status
  }

  static generateNewLoggerKey(id: number) {
    try {
      const key = models.order.createLoggerKey(id)
      return key
    } catch (err: any) {
      if (
        err instanceof SQLiteError &&
        err.code === 'SQLITE_CONSTRAINT_UNIQUE'
      ) {
        throw new ForbiddenError('El servicio ya tiene un token activo')
      }

      throw err
    }
  }

  static updateContract(
    id: number,
    content: {
      object: string
      goals: Array<{
        description: string
        type: string
      }>
      deliverables: Array<{
        label: string
        description: string
        method: string
        acceptance: string
      }>
      usageLimits: Array<{
        label: string
        unit: string
        amount: number
      }>
    }
  ) {
    const order = models.order.findByIdSummary(id)
    if (!order) {
      throw new NotFoundError('No se encontro el servicio')
    }

    if (order.status !== STATUS.PLANNING) {
      throw new ForbiddenError('El servicio no es modificable')
    }

    if (order.is_recurring && content.usageLimits.length < 1) {
      throw new ForbiddenError(
        'Debes definir por lo menos un límite de uso para los servicios recurrentes'
      )
    }

    models.order.dropContract(id)
    models.order.saveContract(id, JSON.stringify(content))
  }

  static getOrderWithContract(id: number, user: { id: string; role: number }) {
    const order = models.order.findByIdSummary(id)
    if (!order) throw new NotFoundError('No se encontro el servicio')

    const { user_id: owner, ...rest } = order
    if (user.role === ROLES.CLIENT && user.id !== owner) {
      throw new ForbiddenError('No tienes acceso a este servicio')
    }

    const info = models.order.getNameAndDescription(id)
    if (!info) throw new NotFoundError('No se encontro el servicio')

    const subtotal = models.order.getItemsTotalCost(id)
    const discount = models.order.getDiscount(id)
    const total = discount
      ? subtotal - subtotal * (discount.percentage / 100)
      : subtotal

    const content = models.order.getContract(id)

    return {
      ...rest,
      name: info.name,
      description: info.description,
      total,
      contract: content
    }
  }
}

export default OrdersService
