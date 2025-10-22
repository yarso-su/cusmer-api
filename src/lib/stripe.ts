import Stripe from 'stripe'
import { STRIPE } from './constants'
import { ServiceError } from './errors'
import { logger } from '@/services/logger'
import { PaymentMeans } from './types'

class StripeService {
  stripe: Stripe
  webhookSecret: string

  constructor(secretKey: string, webhookSecret: string) {
    this.webhookSecret = webhookSecret
    this.stripe = new Stripe(secretKey)
  }

  createCustomer = async (email: string, name: string): Promise<string> => {
    try {
      const { id } = await this.stripe.customers.create({
        email,
        name
      })

      return id
    } catch (err: any) {
      throw new ServiceError('Stripe', err)
    }
  }

  deleteCustomer = async (customerId: string): Promise<void> => {
    try {
      const { deleted } = await this.stripe.customers.del(customerId)

      if (!deleted) throw new Error('Invalid customer id')
    } catch (err: any) {
      throw new ServiceError('Stripe', err)
    }
  }

  createPaymentIntent = async (
    amount: number,
    customer: string,
    orderId: number
  ) => {
    try {
      const { id, client_secret: clientSecret } =
        await this.stripe.paymentIntents.create({
          amount: amount * 100,
          currency: 'mxn',
          customer,
          payment_method_types: ['customer_balance', 'card'],
          payment_method_options: {
            customer_balance: {
              funding_type: 'bank_transfer',
              bank_transfer: {
                type: 'mx_bank_transfer'
              }
            }
          },
          metadata: {
            orderId
          }
        })

      if (!clientSecret) throw new Error('Invalid payment intent id')

      return {
        id,
        clientSecret
      }
    } catch (err: any) {
      throw new ServiceError('Stripe', err)
    }
  }

  createRecurrentPaymentIntent = async (
    amount: number,
    orderId: number,
    payment_method: string,
    customer: string
  ) => {
    const { id } = await this.stripe.paymentIntents.create({
      amount: amount * 100,
      currency: 'mxn',
      payment_method,
      customer,
      off_session: true,
      confirm: true,
      metadata: {
        orderId,
        type: 'recurring'
      }
    })

    return {
      id
    }
  }

  getIntentData = async (
    intentId: string
  ): Promise<{ clientSecret: string; amount: number }> => {
    try {
      const { client_secret: clientSecret, amount } =
        await this.stripe.paymentIntents.retrieve(intentId, {
          expand: ['latest_charge.payment_method_details']
        })
      if (!clientSecret) throw new Error('Invalid payment intent id')

      // TODO: Check if it's possible to retrieve the voucher url from the payment intent

      return { clientSecret, amount }
    } catch (err: any) {
      throw new ServiceError('Stripe', err)
    }
  }

  getEventFromRequest = async (
    payload: string,
    signature: string
  ): Promise<{
    intent: string
    amount: number
    payment_method: string | null
    customer: string | undefined
  }> => {
    try {
      const event = await this.stripe.webhooks.constructEventAsync(
        payload,
        signature,
        this.webhookSecret
      )

      if (event.type !== 'payment_intent.succeeded')
        throw new Error('Invalid event type received')

      const method = event.data.object.payment_method

      const customer = event.data.object.customer
      let customerId
      if (typeof customer === 'object' && customer !== null) {
        customerId = customer.id
      } else if (typeof customer === 'string') {
        customerId = customer
      }

      return {
        intent: event.data.object.id,
        amount: event.data.object.amount,
        payment_method: typeof method === 'string' ? method : null,
        customer: customerId
      }
    } catch (err: any) {
      throw new ServiceError('Stripe', err)
    }
  }

  getPaymentMethodType = async (id: string): Promise<PaymentMeans> => {
    try {
      const { type, card } = await this.stripe.paymentMethods.retrieve(id)

      if (type === 'customer_balance') {
        return '03'
      }

      if (type === 'card' && card && card.funding === 'credit') {
        return '04'
      } else if (type === 'card') {
        return '28'
      }

      throw new Error('Invalid payment method')
    } catch (err: any) {
      throw new ServiceError('Stripe', err)
    }
  }

  setPaymentMethodAsDefault = async (
    paymentMethodId: string,
    customerId: string
  ): Promise<void> => {
    try {
      await this.stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      })
    } catch (err: any) {
      logger.internal('StripeService.setPaymentMethodAsDefault', err)
    }
  }
}

export const stripeService = new StripeService(
  STRIPE.SECRET_KEY,
  STRIPE.WEBHOOK_SECRET
)
