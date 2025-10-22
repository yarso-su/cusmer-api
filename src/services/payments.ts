import {
  ADMIN_EMAIL,
  CLIENT,
  PAYMENT_MEANS,
  ROLES,
  ORDER_STATUSES as STATUS
} from '@/lib/constants'
import {
  AuthError,
  ForbiddenError,
  NotFoundError,
  ServiceError,
  ValidationError
} from '@/lib/errors'
import { factura } from '@/lib/factura'
import { stripeService } from '@/lib/stripe'
import { applyProportionalDiscount, createFacturaConcepts } from '@/lib/utils'
import { logger } from './logger'
import { zoho } from '@/lib/zoho'
import models from '@/models/sqlite'

class PaymentsService {
  static async initialize(orderId: number): Promise<
    | {
        alreadyPaid: false
        clientSecret: string
        intentId: string
        userHaveBillingProfile: boolean
        data: {
          amount: number
          installments: number
        }
      }
    | { alreadyPaid: true }
  > {
    const order = models.order.findByIdSummary(orderId)
    if (!order) throw new NotFoundError('Service not found')

    if (order.status !== STATUS.PAYMENT_REQUIRED) {
      throw new ForbiddenError(
        'El estado actual del servicio no permite inicializar un pago'
      )
    }

    const billingProfile = models.user.getFacturaClient(order.user_id)
    const prevIntent = models.order.getPaymentIntent(orderId)
    const HOURS = 1000 * 60 * 60 * 24

    if (prevIntent) {
      if (Date.now() - new Date(prevIntent.created_at).getTime() > HOURS) {
        models.order.dropPaymentIntent(orderId)
      } else {
        const intentData = await stripeService.getIntentData(
          prevIntent.stripe_id
        )

        return {
          alreadyPaid: false,
          clientSecret: intentData.clientSecret,
          intentId: prevIntent.stripe_id,
          userHaveBillingProfile: Boolean(billingProfile),
          data: {
            amount: intentData.amount / 100,
            installments: order.installments
          }
        }
      }
    }

    // NOTE: Items never should be less than 1
    const items = models.order.getItems(orderId)
    if (items.length === 0) {
      throw new ForbiddenError('El servicio no tiene artículos')
    }

    const discount = models.order.getDiscount(orderId)
    const discountPct = discount?.percentage ?? 0

    const distribution = applyProportionalDiscount(items, discountPct)

    // NOTE: When the discount is 100%, directly create a payment and set the status to on hold
    if (discountPct === 100) {
      const id = models.payment.create({
        amount: distribution.total,
        applied_discount: discountPct,
        means: PAYMENT_MEANS.unknown,
        service_id: orderId
      })

      const factura_uid = models.user.getFacturaClient(order.user_id)
      if (factura_uid) {
        models.payment.createInvoiceTask(id as number)
      } else {
        models.payment.createGlobalInvoiceTask(id as number)
      }

      models.order.setStatus(orderId, STATUS.ON_HOLD)

      zoho.message(
        ADMIN_EMAIL,
        'Administrador',
        `Se ha registrado un pago en el sistema.`,
        {
          link: {
            text: 'Ver pago',
            url: `${CLIENT}/su/services/${orderId}/payments`
          }
        }
      )

      return {
        alreadyPaid: true
      }
    }

    const customer = models.user.getStripeCustomerId(order.user_id)

    if (!customer) {
      throw new NotFoundError('No se encontro el cliente de Stripe')
    }

    const intent = await stripeService.createPaymentIntent(
      distribution.total / order.installments,
      customer,
      orderId
    )

    if (discount && discount.disposable) {
      models.order.deleteDiscount(orderId)
    }

    models.order.savePaymentIntent({
      service_id: orderId,
      stripe_id: intent.id,
      applied_discount: discountPct
    })

    return {
      clientSecret: intent.clientSecret,
      intentId: intent.id,
      userHaveBillingProfile: Boolean(billingProfile),
      data: {
        amount: distribution.total / order.installments,
        installments: order.installments
      },
      alreadyPaid: false
    }
  }

  static async register(payload: string, signature: string | null) {
    if (!signature) {
      throw new AuthError()
    }

    const e = await stripeService.getEventFromRequest(payload, signature)
    const amount = e.amount / 100
    if (e.payment_method === null) {
      logger.internal(
        'PaymentsService.register[webhook]',
        'Invalid payment method'
      )

      throw new ValidationError('Invalid payment method')
    }

    const paymentMethod = await stripeService.getPaymentMethodType(
      e.payment_method
    )

    const intent = models.order.getPaymentIntentByStripeId(e.intent)
    if (!intent) {
      throw new ServiceError(
        'Stripe-Webhook',
        `Payment intent not found (${e.intent})`
      )
    }

    const order = models.order.findByIdSummary(intent.order_id)
    if (!order) {
      throw new ServiceError(
        'Stripe-webook',
        `Service not found (${intent.order_id}) when trying to register a payment`
      ) // NOTE: This should never happen
    }

    models.order.dropPaymentIntent(intent.order_id)
    const id = models.payment.create({
      amount,
      applied_discount: intent.applied_discount,
      means: paymentMethod,
      service_id: intent.order_id
    })

    const factura_uid = models.user.getFacturaClient(order.user_id)
    if (factura_uid) {
      models.payment.createInvoiceTask(id as number)
    } else {
      models.payment.createGlobalInvoiceTask(id as number)
    }

    models.order.setStatus(intent.order_id, STATUS.ON_HOLD)
    models.payment.saveTax(amount - Math.floor(amount / 1.16))

    zoho.message(
      ADMIN_EMAIL,
      'Administrador',
      `Se ha registrado un pago en el sistema.`,
      {
        link: {
          text: 'Ver pago',
          url: `${CLIENT}/su/services/${intent.order_id}/payments`
        }
      }
    )
  }

  static async generateGlobalInvoice(payments: number[]) {
    const concepts = payments.reduce((acc, paymentId) => {
      const payment = models.payment.findById(paymentId)
      if (!payment) {
        throw new Error(`No se encontro el pago (id: [${paymentId}])`)
      }

      const order = models.order.findByIdSummary(payment.order_id)
      if (!order) {
        throw new Error(
          `No se encontro el servicio (pago: [${paymentId}], order: [${payment.order_id}])`
        )
      }

      const items = models.order.getItems(payment.order_id)
      if (items.length === 0) {
        throw new Error(`El servicio no tiene artículos (pago: [${paymentId}])`)
      }

      const { items: proccessedItems } = applyProportionalDiscount(
        items.map(item => {
          return {
            ...item,
            cost: item.cost / order.installments
          }
        }),
        payment.applied_discount
      )

      return [...acc, ...createFacturaConcepts(proccessedItems)]
    }, [] as any[])

    const factura_uid = await factura.invoice.createGlobal('04', concepts)
    models.payment.saveGlobalInvoice(payments, factura_uid)
    models.payment.deleteGlobalInvoiceTasks()
  }

  static async generateInvoice(paymentId: number) {
    const payment = models.payment.findById(paymentId)
    if (!payment) {
      throw new NotFoundError('No se encontro el pago')
    }
    if (payment.invoice_id !== null) {
      throw new ForbiddenError('Ya se generó la factura')
    }

    const HOURS = 1000 * 60 * 60 * 24 * 3
    if (Date.now() - new Date(payment.created_at).getTime() > HOURS) {
      throw new ForbiddenError(
        'Para generar una factura no deben pasar mas de 72 horas desde la creación del pago'
      )
    }

    const order = models.order.findByIdSummary(payment.order_id)
    if (!order) throw new NotFoundError('No se encontro el servicio')

    const items = models.order.getItems(payment.order_id)
    if (items.length === 0) {
      throw new NotFoundError('No se encontro el servicio')
    } // NOTE: This should never happen

    const proccessedItems = items.map(item => {
      return {
        ...item,
        cost: item.cost / order.installments
      }
    })

    const distribution = applyProportionalDiscount(
      proccessedItems,
      payment.applied_discount
    )
    const client = models.user.getFacturaClient(order.user_id)
    if (!client) {
      throw new Error(
        'No se encontro el cliente de Factura.com para generar la factura'
      )
    }

    const concepts = createFacturaConcepts(distribution.items)

    const factura_uid = await factura.invoice.create(
      client.factura_client_id,
      payment.means,
      concepts,
      client.cfdi_use
    )

    models.payment.saveInvoice({
      payment_id: paymentId,
      factura_invoice_id: factura_uid
    })
    models.payment.deleteInvoiceTask(paymentId)
  }

  static async regenerateInvoice(paymentId: number) {
    const REASON = '02' // NOTE: This is used when the user needs to correct data

    const payment = models.payment.findById(paymentId)
    if (!payment) {
      throw new NotFoundError('No se encontro el pago')
    }
    if (payment.invoice_id === null) {
      throw new ForbiddenError('No se ha generado la factura')
    }

    const HOURS = 1000 * 60 * 60 * 24 * 3
    if (Date.now() - new Date(payment.created_at).getTime() > HOURS) {
      throw new ForbiddenError(
        'Para re-generar la factura no deben pasar mas de 72 horas desde la creación del pago'
      )
    }

    const order = models.order.findByIdSummary(payment.order_id)
    if (!order) throw new NotFoundError('No se encontro el servicio')

    const items = models.order.getItems(payment.order_id)
    if (items.length === 0) {
      throw new NotFoundError('No se encontro el servicio')
    } // NOTE: This should never happen

    const proccessedItems = items.map(item => {
      return {
        ...item,
        cost: item.cost / order.installments
      }
    })

    const distribution = applyProportionalDiscount(
      proccessedItems,
      payment.applied_discount
    )

    const client = models.user.getFacturaClient(order.user_id)
    const concepts = createFacturaConcepts(distribution.items)

    const new_factura_uid = await factura.invoice.create(
      client?.factura_client_id ?? factura.client.generic, // TODO: Use instead env to set the UID of the generic client
      payment.means,
      concepts,
      client?.cfdi_use
    )
    await factura.invoice.cancel(payment.invoice_id, new_factura_uid, REASON)

    models.payment.deleteInvoice(paymentId)
    models.payment.saveInvoice({
      payment_id: paymentId,
      factura_invoice_id: new_factura_uid
    })
  }

  static getByIntent = (intentId: string) => {
    const payment = models.payment.getIdByIntendId(intentId)
    if (!payment) throw new NotFoundError('No se encontro el pago')

    return payment
  }

  static getInvoice = async (
    paymentId: number,
    user: { id: string; role: number }
  ) => {
    if (user.role === ROLES.CLIENT) {
      const serviceId = models.payment.getServiceId(paymentId)
      if (!serviceId) {
        throw new NotFoundError('No se encontro el servicio')
      }

      const userId = models.order.getUserId(serviceId)
      if (!userId) {
        throw new NotFoundError('No se encontro el usuario')
      }

      if (userId !== user.id) {
        throw new ForbiddenError('No tienes permisos para ver la factura')
      }
    }

    const invoice = models.payment.getInvoice(paymentId)
    if (!invoice) throw new NotFoundError('No se encontro la factura')

    const pdf = await factura.invoice.download(invoice)

    return pdf
  }
}

export default PaymentsService
