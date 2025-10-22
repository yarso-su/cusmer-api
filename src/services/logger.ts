import { ADMIN_EMAIL, CLIENT } from '@/lib/constants'
import { zoho } from '@/lib/zoho'
import models from '@/models/sqlite'

class Logger {
  async internal(origin: string, error: any) {
    try {
      let content = 'Unable to get information'
      if (typeof error === 'object' && typeof error.stack === 'string') {
        content = error.stack
      } else if (
        typeof error === 'object' &&
        typeof error.message === 'string'
      ) {
        content = error.message
      } else if (typeof error === 'string') {
        content = error
      }

      models.log.save({ origin, content })
      const sent = await zoho.message(
        ADMIN_EMAIL,
        'Administrador',
        `Se ha registrado una entrada en el logger interno.`,
        {
          link: {
            url: `${CLIENT}/su/logs`,
            text: 'Revisar logs'
          }
        }
      )

      if (!sent) {
        console.error('Email not sent, Internal')
      }
    } catch (err: any) {
      console.error(err)
    }
  }

  async order(orderId: number, origin: string, content: string) {
    try {
      const logId = models.order.saveLog({
        origin,
        content,
        service_id: orderId
      })

      const sent = await zoho.message(
        ADMIN_EMAIL,
        `Administrador`,
        `Se ha registrado una entrada en el logger de un servicio.`,
        {
          link: {
            url: `${CLIENT}/su/services/${orderId}/logs`,
            text: 'Revisar logs'
          }
        }
      )

      if (!sent) {
        console.error(`Email not sent, Service (${orderId}), Log (${logId})`)
      }
    } catch (err: any) {
      console.error(err)
    }
  }
}

export const logger = new Logger()
