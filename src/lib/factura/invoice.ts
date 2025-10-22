import { ServiceError } from '../errors'
import { PaymentMeans } from '../types'

class FacturaInvoice {
  private host: string
  private credentials: Record<string, string>
  private DEFAULT_CFDI_USE = 'S01'
  private generic_client: string
  private fixed_months_list: string[] = [
    '01',
    '02',
    '03',
    '04',
    '05',
    '06',
    '07',
    '08',
    '09',
    '10',
    '11',
    '12'
  ]

  constructor(
    host: string,
    credentials: Record<string, string>,
    client: string
  ) {
    this.host = host
    this.credentials = credentials
    this.generic_client = client
  }

  async create(
    UID: string,
    FormaPago: PaymentMeans,
    concepts: any[],
    UsoCFDI?: string
  ): Promise<string> {
    const res = await fetch(`${this.host}/v4/cfdi40/create`, {
      headers: this.credentials,
      method: 'POST',
      body: JSON.stringify({
        Receptor: {
          UID
        },
        TipoDocumento: 'factura',
        UsoCFDI: UsoCFDI ?? this.DEFAULT_CFDI_USE,
        Serie: 5478563,
        FormaPago,
        MetodoPago: 'PUE',
        Moneda: 'MXN',
        EnviarCorreo: true,
        Conceptos: concepts
      })
    })

    const content = await res.json()

    if (content.response !== 'success') {
      throw new Error(JSON.stringify(content))
    }

    return content.UUID
  }

  async createGlobal(
    FormaPago: PaymentMeans,
    concepts: any[]
  ): Promise<string> {
    try {
      const today = new Date()

      const res = await fetch(`${this.host}/v4/cfdi40/create`, {
        headers: this.credentials,
        method: 'POST',
        body: JSON.stringify({
          Receptor: {
            UID: this.generic_client
          },
          TipoDocumento: 'factura',
          InformacionGlobal: {
            Periodicidad: '01',
            Meses: this.fixed_months_list[today.getMonth()],
            Año: String(today.getFullYear())
          },
          UsoCFDI: this.DEFAULT_CFDI_USE,
          Serie: 5478563, // IMPORTANT: You should pick the correct serie for your company in Factura.com dashboard
          FormaPago,
          MetodoPago: 'PUE',
          Moneda: 'MXN',
          EnviarCorreo: true,
          Conceptos: concepts
        })
      })

      const content = await res.json()

      if (content.response !== 'success') {
        throw new Error(JSON.stringify(content))
      }

      if (typeof content.UUID !== 'string') {
        throw new Error('Invalid UUID')
      }

      return content.UUID
    } catch (err) {
      throw new ServiceError('Factura.com', err)
    }
  }

  async send(id: string): Promise<void> {
    try {
      const res = await fetch(`${this.host}/v4/cfdi40/${id}/email`, {
        headers: this.credentials,
        method: 'GET'
      })

      if (!res.ok) {
        throw new Error('Invalid response')
      }

      const content = await res.json()
      if (content.response !== 'success') {
        throw new Error(JSON.stringify(content))
      }
    } catch (err) {
      throw new ServiceError('Factura.com', err)
    }
  }

  async download(id: string): Promise<ArrayBuffer> {
    try {
      const res = await fetch(`${this.host}/v4/cfdi40/${id}/pdf`, {
        headers: this.credentials,
        method: 'GET'
      })

      if (!res.ok) {
        throw new Error('Invalid response')
      }

      const buffer = await res.arrayBuffer()
      return buffer
    } catch (err) {
      throw new ServiceError('Factura.com', err)
    }
  }

  async cancel(
    UUID: string,
    replaceUUID: string,
    reason: string
  ): Promise<void> {
    try {
      const res = await fetch(`${this.host}/v4/cfdi40/${UUID}/cancel`, {
        headers: this.credentials,
        method: 'POST',
        body: JSON.stringify({
          motivo: reason,
          folioSustituto: replaceUUID
        })
      })

      const content = await res.json()

      if (content.response !== 'success') {
        throw new Error(JSON.stringify(content))
      }
    } catch (err) {
      throw new ServiceError('Factura.com', err)
    }
  }
}

export default FacturaInvoice
