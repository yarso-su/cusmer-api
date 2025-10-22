import { ServiceError } from '../errors'

class FacturaCatalog {
  private host: string
  private credentials: Record<string, string>
  private regimes: { collection: any[]; updatedAt: number } | null = null
  private countries: { collection: any[]; updatedAt: number } | null = null

  constructor(host: string, credentials: Record<string, string>) {
    this.host = host
    this.credentials = credentials
  }

  async getCFDIUses(): Promise<string> {
    try {
      const res = await fetch(`${this.host}/v4/catalogo/UsoCfdi`, {
        headers: this.credentials,
        method: 'GET'
      })

      if (!res.ok) {
        throw new Error(res.statusText)
      }

      const uses = await res.json()
      return uses.map(({ key, name, use }: any) => ({
        key,
        name,
        use
      }))
    } catch (err: any) {
      throw new ServiceError('Factura.com', err)
    }
  }

  async getRegimes(): Promise<any[]> {
    try {
      if (
        this.regimes &&
        this.regimes.updatedAt > Date.now() - 1000 * 60 * 60 * 24
      ) {
        return this.regimes.collection
      }

      const res = await fetch(`${this.host}/v3/catalogo/RegimenFiscal`, {
        headers: this.credentials,
        method: 'GET'
      })

      if (!res.ok) {
        throw new Error(res.statusText)
      }

      const body = await res.json()
      this.regimes = {
        collection: body.data,
        updatedAt: Date.now()
      }

      return body.data
    } catch (err: any) {
      throw new ServiceError('Factura.com', err)
    }
  }

  async getCountries(): Promise<any[]> {
    try {
      if (
        this.countries &&
        this.countries.updatedAt > Date.now() - 1000 * 60 * 60 * 24 * 7
      ) {
        return this.countries.collection
      }

      const res = await fetch(`${this.host}/v3/catalogo/Pais`, {
        headers: this.credentials,
        method: 'GET'
      })

      if (!res.ok) {
        throw new Error(res.statusText)
      }

      const body = await res.json()
      this.countries = {
        collection: body.data,
        updatedAt: Date.now()
      }

      return body.data
    } catch (err: any) {
      throw new ServiceError('Factura.com', err)
    }
  }
}

export default FacturaCatalog
