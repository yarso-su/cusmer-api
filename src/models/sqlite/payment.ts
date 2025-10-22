import { QUERY_LIMIT } from '@/lib/constants'
import { PaymentMeans } from '@/lib/types'
import Database from 'bun:sqlite'

class Payment {
  db: Database

  constructor(db: Database) {
    this.db = db
  }

  saveTax = (amount: number) => {
    this.db.prepare('insert into taxes(amount) values($amount)').run({
      amount
    })
  }

  // TODO: Review behaviour
  getTotalTax = () => {
    const res = this.db
      .query('select sum(amount) amount, max(id) last from taxes')
      .get() as { amount: number | null; last: number | null }
    if (res.amount !== null && res.last !== null) return res

    return null
  }

  clearTotalTax = (limit: number) => {
    this.db.prepare('delete from taxes where id <= $limit').run({
      limit
    })
  }

  getAllOfCurrentMonth = () => {
    const res = this.db
      .query(
        `select ifnull(sum(amount), 0) total from payments where created_at >= strftime('%Y-%m-01', 'now')
      and created_at < strftime('%Y-%m-01', 'now', '+1 month')`
      )
      .get() as { total: number }
    return res.total
  }

  getOrder = (id: number) => {
    const res = this.db
      .prepare('select service_id from payments where id = $id')
      .get({
        id
      }) as { service_id: number }
    return res?.service_id
  }

  // TODO: Review behaviour
  getIdByIntendId = (intentId: string) => {
    const res = this.db
      .prepare('select id from payments where intent_id = $intentId')
      .get({
        intentId
      }) as { id: number }
    return res?.id
  }

  create = (payment: {
    amount: number
    means: PaymentMeans
    applied_discount: number
    service_id: number
  }) => {
    return this.db
      .prepare(
        'insert into payments(amount, means, applied_discount, service_id) values($amount, $means, $applied_discount, $service_id)'
      )
      .run(payment).lastInsertRowid
  }

  saveInvoice = (invoice: {
    payment_id: number
    factura_invoice_id: string
  }) => {
    this.db
      .prepare(
        'insert into payment_factura(payment_id, factura_invoice_id) values($payment_id, $factura_invoice_id)'
      )
      .run(invoice)
  }

  saveGlobalInvoice = (payments: number[], factura: string) => {
    const query = this.db.prepare(
      'insert into payment_factura(payment_id, factura_invoice_id) values($id, $factura)'
    )

    const save = this.db.transaction(payments => {
      for (const payment of payments)
        query.run({
          id: payment,
          factura
        })
    })

    save(payments)
  }

  deleteInvoice = (id: number) => {
    this.db.prepare('delete from payment_factura where payment_id = $id').run({
      id
    })
  }

  getInvoice = (id: number) => {
    const res = this.db
      .prepare(
        'select factura_invoice_id from payment_factura where payment_id = $id'
      )
      .get({
        id
      }) as { factura_invoice_id: string } | null

    return res?.factura_invoice_id
  }

  createInvoiceTask = (id: number) => {
    this.db
      .prepare('insert into pending_invoices(payment_id) values($id)')
      .run({
        id
      })
  }

  createGlobalInvoiceTask = (id: number) => {
    this.db
      .prepare('insert into pending_global_invoices(payment_id) values($id)')
      .run({
        id
      })
  }

  deleteInvoiceTask = (id: number) => {
    this.db.prepare('delete from pending_invoices where payment_id = $id').run({
      id
    })
  }

  deleteGlobalInvoiceTasks = () => {
    this.db.prepare('delete from pending_global_invoices').run()
  }

  // deleteAllPendingInvoiceTasks = (paymendId: number) => {
  //   this.db
  //     .prepare('delete from pending_invoices where payment_id = $paymendId')
  //     .run({
  //       paymendId
  //     })
  // }

  getPendingInvoiceTasks = () => {
    const res = this.db
      .query('select payment_id from pending_invoices')
      .all() as { payment_id: number }[]
    const tasks = res.map((task: { payment_id: number }) => task.payment_id)

    return tasks
  }

  getPendingGlobalInvoiceTasks = () => {
    const res = this.db
      .query('select payment_id from pending_global_invoices')
      .all() as { payment_id: number }[]
    const tasks = res.map((task: { payment_id: number }) => task.payment_id)

    return tasks
  }

  getServiceId(paymentId: number) {
    const res = this.db
      .prepare('select service_id from payments where id = $paymentId')
      .get({
        paymentId
      }) as { service_id: number } | null

    return res?.service_id
  }

  findById = (id: number) => {
    return this.db
      .prepare(
        'select p.service_id order_id, p.means, p.applied_discount, f.factura_invoice_id invoice_id, p.created_at from payments p left join payment_factura f on p.id = f.payment_id where id = $id'
      )
      .get({
        id
      }) as {
      order_id: number
      means: PaymentMeans
      invoice_id: string | null
      applied_discount: number
      created_at: string
    } | null
  }

  findAll = (limit = QUERY_LIMIT, page = 1) => {
    const offset = page ? (page - 1) * QUERY_LIMIT : 0
    return this.db
      .prepare(
        'select id, service_id order_id, amount, created_at from payments order by created_at desc limit $limit offset $offset'
      )
      .all({
        limit,
        offset
      }) as {
      id: number
      order_id: number
      amount: string
      created_at: string
    }[]
  }

  findAllByOrder = (orderId: number) => {
    return this.db
      .prepare(
        'select id, amount, created_at from payments where service_id = $orderId'
      )
      .all({
        orderId
      }) as { id: number; amount: string; created_at: string }[]
  }

  findLastByOrder = (orderId: number) => {
    return this.db
      .prepare(
        'select id, created_at from payments where service_id = $orderId order by created_at desc limit 1'
      )
      .get({ orderId }) as { id: number; created_at: string } | null
  }

  // TODO: Consider implementing pagination
  findAllByUser = (userId: string, limit = 100) => {
    return this.db
      .prepare(
        'select p.id, p.amount, p.service_id order_id, p.created_at from payments p left join services s on p.service_id = s.id where s.user_id = $userId order by p.created_at desc limit $limit'
      )
      .all({
        userId,
        limit
      }) as {
      id: number
      amount: string
      order_id: number
      created_at: string
    }[]
  }
}

export default Payment
