import { LEGAL, LEGAL_REPOSITORY_URL, ORDER_ITEM_KEYS } from './constants'

export const newCode = () =>
  Math.floor(Math.random() * (999999 - 100000 + 1) + 100000)

export const newExp = (seconds: number) =>
  Math.floor(Date.now() / 1000) + seconds

export const isDbError = (
  error: unknown
): error is { code?: string; errno?: string; message: string } => {
  return (
    typeof error === 'object' &&
    error !== null &&
    ('code' in error || 'errno' in error || 'message' in error)
  )
}

export function applyProportionalDiscount(
  items: { name: string; type: number; cost: number }[],
  discount: number
): {
  subtotal: number
  discount: number
  total: number
  items: {
    name: string
    key: string
    subtotal: number
    discount: number
    total: number
  }[]
} {
  if (items.length === 0) throw new Error('Items list is empty')

  if (discount < 0 || discount > 100) {
    throw new Error('Discount must be between 0 and 100')
  }

  const itemsInCents = items.map(item => ({
    ...item,
    costInCents: Math.round(item.cost * 100)
  }))

  const subtotalInCents = itemsInCents.reduce(
    (acc, item) => acc + item.costInCents,
    0
  )

  const discountTotalInCents = Math.round(subtotalInCents * (discount / 100))

  const discounts = itemsInCents.map(item =>
    Math.round((item.costInCents / subtotalInCents) * discountTotalInCents)
  )

  const totalDistributed = discounts.reduce((sum, val) => sum + val, 0)
  const roundingDifference = discountTotalInCents - totalDistributed
  discounts[discounts.length - 1] += roundingDifference

  const itemsWithDiscount = itemsInCents.map((item, index) => {
    const discountInCents = discounts[index]
    const finalCostInCents = item.costInCents - discountInCents

    return {
      name: item.name,
      key: ORDER_ITEM_KEYS[item.type],
      subtotal: item.cost,
      discount: discountInCents / 100,
      total: finalCostInCents / 100
    }
  })

  return {
    subtotal: subtotalInCents / 100,
    discount: discountTotalInCents / 100,
    total: (subtotalInCents - discountTotalInCents) / 100,
    items: itemsWithDiscount
  }
}

export function createFacturaConcepts(
  items: {
    name: string
    key: string
    subtotal: number
    discount: number
    total: number
  }[]
) {
  return items.map(item => {
    const subtotal = item.subtotal / 1.16
    const discount = item.discount / 1.16
    const total = subtotal - discount
    const tax = total * 0.16

    return {
      ClaveProdServ: item.key,
      Cantidad: 1, // NOTE: Should be 1 until business logic don't require a complex logic
      ClaveUnidad: 'E48',
      Unidad: 'Unidad de servicio',
      ValorUnitario: subtotal.toFixed(2),
      Descripcion: `Servicio. ${item.name}`,
      Descuento: discount.toFixed(2),
      ObjetoImp: total > 0 ? '02' : '01',
      Impuestos: {
        Traslados:
          total > 0
            ? [
                {
                  Base: total.toFixed(2),
                  Impuesto: '002',
                  TipoFactor: 'Tasa',
                  TasaOCuota: '0.160000',
                  Importe: tax.toFixed(2)
                }
              ]
            : [],
        Retenidos: [],
        Locales: []
      }
    }
  })
}

export const LEGAL_DOCUMENTS_ACCEPTED_MESSAGE = `Confirmamos que has aceptado los siguientes documentos legales en nuestra plataforma:<br/><br/><br/>Términos y Condiciones de Uso (${LEGAL.TERMS.V})<br/>Hash[<span style="color: #2b7fff;">${LEGAL.TERMS.HASH}</span>]<br/><br/>Política de Privacidad (${LEGAL.POLICIES.V})<br/>Hash[<span style="color: #2b7fff;">${LEGAL.POLICIES.HASH}</span>]<br/><br/>Puedes consultar las versiones exactas que aceptaste en cualquier momento desde el siguiente enlace:<br/><br/><a style="color: #2b7fff; text-decoration: underline;" target="_blank" href="${LEGAL_REPOSITORY_URL}">Repositorio</a><br/><br/>Te recomendamos conservar este mensaje como referencia personal.`
