import { ServiceError } from '../errors'

const NATIONAL_GENERIC_RFC = 'XAXX010101000'
const FOREIGN_GENERIC_RFC = 'XEXX010101000'

export interface IClient {
  rfc: string
  razons: string
  codpos: number
  email: string
  regimen: string
  // pais: string
  calle?: string
  numero_exterior?: string
  numero_interior?: string
  colonia?: string
  ciudad?: string
  delegacion?: string
  localidad?: string
  estado?: string
  nombre?: string
  apellidos?: string
  telefono?: string
  email2?: string
  email3?: string
}

export interface IForeignClient {
  razons: string
  codpos: number
  email: string
  pais: string
}

interface IClientRetrieve {
  RazonSocial: string
  RFC: string
  Regimen: string
  RegimenId: string
  Calle: string
  Numero: string
  Interior: string
  Colonia: string
  CodigoPostal: string
  Ciudad: string
  Delegacion: string
  Estado: string
  Pais: string
  NumRegIdTrib: string
  UsoCFDI: string
  Contacto: {
    Nombre?: string
    Apellidos?: string
    Email?: string
    Email2?: string
    Email3?: string
    Telefono?: string
  }
}

class FacturaClient {
  private host: string
  private credentials: Record<string, string>
  generic: string

  constructor(
    host: string,
    credentials: Record<string, string>,
    generic: string
  ) {
    this.host = host
    this.credentials = credentials
    this.generic = generic
  }

  async getGenericUID(): Promise<string> {
    try {
      const res = await fetch(
        `${this.host}/v1/clients/${NATIONAL_GENERIC_RFC}`,
        {
          headers: this.credentials,
          method: 'GET'
        }
      )

      const content = await res.json()

      if (content.status !== 'success') {
        throw new Error(JSON.stringify(content))
      }

      return content.Data.UID
    } catch (err) {
      throw new ServiceError('Factura.com', err)
    }
  }

  async get(uid: string): Promise<IClientRetrieve> {
    try {
      const res = await fetch(`${this.host}/v1/clients/${uid}`, {
        headers: this.credentials,
        method: 'GET'
      })

      const content = await res.json()

      if (content.status !== 'success') {
        throw new Error(JSON.stringify(content))
      }

      return content.Data
    } catch (err) {
      throw new ServiceError('Factura.com', err)
    }
  }

  async register({ razons, ...data }: IClient): Promise<string> {
    try {
      const COUNTRY = 'MEX'

      const res = await fetch(`${this.host}/v1/clients/create`, {
        headers: this.credentials,
        method: 'POST',
        body: JSON.stringify({
          ...data,
          pais: COUNTRY,
          razons: razons.toUpperCase()
        })
      })

      const content = await res.json()

      if (content.status !== 'success') {
        throw new Error(JSON.stringify(content))
      }

      return content.Data.UID
    } catch (err) {
      throw new ServiceError('Factura.com', err)
    }
  }

  async registerForeign(user: IForeignClient): Promise<string> {
    try {
      const res = await fetch(`${this.host}/v1/clients/create`, {
        headers: this.credentials,
        method: 'POST',
        body: JSON.stringify({
          ...user,
          rfc: FOREIGN_GENERIC_RFC,
          regimen: '616'
        })
      })

      const content = await res.json()

      if (content.status !== 'success') {
        throw new Error(JSON.stringify(content))
      }

      return content.Data.UID
    } catch (err) {
      throw new ServiceError('Factura.com', err)
    }
  }

  async update(uid: string, { razons, ...data }: IClient): Promise<void> {
    try {
      const COUNTRY = 'MEX'

      const res = await fetch(`${this.host}/v1/clients/${uid}/update`, {
        headers: this.credentials,
        method: 'POST',
        body: JSON.stringify({
          ...data,
          pais: COUNTRY,
          razons: razons.toUpperCase()
        })
      })

      const content = await res.json()

      if (content.status !== 'success') {
        throw new Error(JSON.stringify(content))
      }
    } catch (err) {
      throw new ServiceError('Factura.com', err)
    }
  }

  async updateForeign(uid: string, user: IForeignClient): Promise<void> {
    try {
      const res = await fetch(`${this.host}/v1/clients/${uid}/update`, {
        headers: this.credentials,
        method: 'POST',
        body: JSON.stringify({
          ...user,
          rfc: FOREIGN_GENERIC_RFC,
          regimen: '616'
        })
      })

      const content = await res.json()

      if (content.status !== 'success') {
        throw new Error(JSON.stringify(content))
      }
    } catch (err) {
      throw new ServiceError('Factura.com', err)
    }
  }

  async delete(uid: string): Promise<void> {
    try {
      const res = await fetch(`${this.host}/v1/clients/destroy/${uid}`, {
        headers: this.credentials,
        method: 'POST'
      })

      if (!res.ok) throw new Error('Error al borrar cliente')
    } catch (err: any) {
      throw new ServiceError('Factura.com', err)
    }
  }
}

export default FacturaClient
