import { FACTURA, PRODUCTION } from '../constants'
import FacturaClient from './client'
import FacturaInvoice from './invoice'
import FacturaCatalog from './catalog'

class Factura {
  client: FacturaClient
  invoice: FacturaInvoice
  catalog: FacturaCatalog

  constructor(
    apiKey: string,
    secretKey: string,
    generic: string,
    opts?: { sandbox: boolean }
  ) {
    let host = opts?.sandbox
      ? 'https://sandbox.factura.com/api'
      : 'https://api.factura.com'

    const credentials = {
      'Content-Type': 'application/json',
      'F-PLUGIN': '9d4095c8f7ed5785cb14c0e3b033eeb8252416ed',
      'F-Api-Key': apiKey,
      'F-Secret-Key': secretKey
    }

    this.client = new FacturaClient(host, credentials, generic)
    this.invoice = new FacturaInvoice(host, credentials, generic)
    this.catalog = new FacturaCatalog(host, credentials)
  }
}

export const factura = new Factura(
  FACTURA.API_KEY,
  FACTURA.SECRET_KEY,
  FACTURA.GENERIC_CLIENT_ID,
  {
    sandbox: PRODUCTION === false
  }
)
