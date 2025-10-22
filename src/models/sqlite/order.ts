import Database from 'bun:sqlite'
import {
  ORDER_STATUSES,
  QUERY_LIMIT,
  ORDER_STATUSES as STATUS
} from '@/lib/constants'

class Order {
  db: Database

  constructor(db: Database) {
    this.db = db
  }

  getUserId(id: number) {
    const res = this.db
      .prepare('select user_id from services where id = $id')
      .get({
        id
      }) as { user_id: string } | null

    return res?.user_id
  }

  getNameAndDescription = (id: number) => {
    return this.db
      .prepare('select name, description from services where id = $id')
      .get({ id }) as { name: string; description: string } | null
  }

  saveContract = (id: number, content: string) => {
    this.db
      .prepare(
        'insert into service_contract(service_id, content) values($id, $content)'
      )
      .run({ id, content })
  }

  getContract = (id: number) => {
    const res = this.db
      .prepare('select content from service_contract where service_id = $id')
      .get({ id }) as { content: string } | null
    return res?.content
  }

  dropContract = (id: number) => {
    this.db
      .prepare('delete from service_contract where service_id = $id')
      .run({ id })
  }

  getPaymentsCount = (id: number) => {
    const res = this.db
      .prepare('select count(*) count from payments where service_id = $id')
      .get({ id }) as { count: number }
    return res.count
  }

  savePaymentMethod = (id: number, method: string) => {
    this.db
      .prepare(
        'insert into service_payment_method(service_id, stripe_id) values($id, $method)'
      )
      .run({ id, method })
  }

  dropPaymentMethod = (id: number) => {
    this.db
      .prepare('delete from service_payment_method where service_id = $id')
      .run({ id })
  }

  getPaymentMethod = (id: number) => {
    const res = this.db
      .prepare(
        'select stripe_id from service_payment_method where service_id = $id'
      )
      .get({ id }) as { stripe_id: string } | null

    return res?.stripe_id
  }

  createLoggerKey = (order: number) => {
    return this.db
      .prepare('insert into service_logger_key (service_id) values ($id)')
      .run({ id: order }).lastInsertRowid
  }

  dropLoggerKey = (id: number) => {
    this.db
      .prepare('delete from service_logger_key where service_id = $id')
      .run({ id })
  }

  getServiceIdByLoggerKey = (key: number) => {
    const res = this.db
      .prepare('select service_id from service_logger_key where key = $key')
      .get({ key }) as { service_id: number } | null
    return res?.service_id
  }

  checkIfExists = (id: number) => {
    return (
      this.db.prepare('select id from services where id = $id').get({ id }) !==
      undefined
    )
  }

  getStatusById = (id: number) => {
    const res = this.db
      .prepare('select status from services where id = $id')
      .get({ id }) as { status: number } | null
    return res?.status
  }

  getAllNamesByUser = (userId: string) => {
    return this.db
      .prepare('select id, name from services where user_id = $userId')
      .all({ userId }) as { id: number; name: string }[]
  }

  getNameById = (id: number, userId: string) => {
    const res = this.db
      .prepare('select name from services where id = $id and user_id = $userId')
      .get({ id, userId }) as { name: string } | null
    return res?.name
  }

  saveLog = (log: { service_id: number; origin: string; content: string }) => {
    return this.db
      .prepare(
        'insert into service_logs(service_id, origin, content) values($service_id, $origin, $content)'
      )
      .run(log).lastInsertRowid
  }

  getLogs = (id: number) => {
    return this.db
      .prepare(
        'select origin, content, created_at from service_logs where service_id = $id order by created_at desc limit 30'
      )
      .all({ id }) as { origin: string; content: string; created_at: string }[]
  }

  getItemsCountById = (id: number) => {
    const res = this.db
      .prepare(
        'select count(id) count from service_items where service_id = $id'
      )
      .get({ id }) as { count: number }
    return res.count
  }

  getItems = (id: number) => {
    return this.db
      .prepare(
        'select i.id, i.name, i.description, i.type, i.cost from service_items i where i.service_id = $id'
      )
      .all({ id }) as {
      id: number
      name: string
      description: string
      type: number
      cost: number
    }[]
  }

  getItemsTotalCost = (id: number) => {
    const res = this.db
      .prepare(
        'select ifnull(sum(cost), 0) cost from service_items where service_id = $id'
      )
      .get({ id }) as { cost: number }
    return res.cost
  }

  create = (order: {
    user_id: string
    name: string
    description: string
    tag: string
    duration_weeks: number
    payment_installments: number
    is_recurring: boolean
  }) => {
    return this.db
      .prepare(
        'insert into services(user_id, name, description, tag, duration_weeks, payment_installments, portfolio_consent, is_recurring) values($user_id, $name, $description, $tag, $duration_weeks, $payment_installments, $portfolio_consent, $is_recurring)'
      )
      .run(order).lastInsertRowid
  }

  update = (
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
  ) => {
    return (
      this.db
        .prepare(
          'update services set name = $name, description = $description, tag = $tag, duration_weeks = $duration_weeks, payment_installments = $payment_installments, portfolio_consent = $portfolio_consent, is_recurring = $is_recurring where id = $id'
        )
        .run({ id, ...data }).changes > 0
    )
  }

  setStatus = (id: number, status: number) => {
    return (
      this.db
        .prepare('update services set status = $status where id = $id')
        .run({ id, status }).changes > 0
    )
  }

  createDiscount = (discount: {
    service_id: number
    percentage: number
    description: string
    disposable: boolean
  }) => {
    this.db
      .prepare(
        `insert into service_discount(service_id, percentage, description, disposable) values($service_id, $percentage, $description, $disposable)`
      )
      .run(discount)
  }

  deleteDiscount = (id: number) => {
    this.db
      .prepare('delete from service_discount where service_id = $id')
      .run({ id })
  }

  getDiscount = (orderId: number) => {
    return this.db
      .prepare(
        'select percentage, disposable from service_discount where service_id = $orderId'
      )
      .get({ orderId }) as { percentage: number; disposable: boolean } | null
  }

  createSubscription = (service_id: number) => {
    this.db
      .prepare('update services set is_recurring = true where id = $service_id')
      .run({ service_id })
  }

  deleteSubscription = (service_id: number) => {
    this.db
      .prepare(
        'update services set is_recurring = false where id = $service_id'
      )
      .run({ service_id })
  }

  getIdByItemId = (itemId: number) => {
    const res = this.db
      .prepare('select service_id id from service_items where id = $itemId')
      .get({ itemId }) as { id: number } | null
    return res?.id
  }

  createItem = (item: {
    service_id: number
    name: string
    description: string
    type: number
    cost: number
  }) => {
    return this.db
      .prepare(
        'insert into service_items(service_id, name, description, type, cost) values($service_id, $name, $description, $type, $cost)'
      )
      .run(item).lastInsertRowid
  }

  updateItem = (
    itemId: number,
    data: {
      name: string
      description: string
      type: number
      cost: number
    }
  ) => {
    return (
      this.db
        .prepare(
          'update service_items set name = $name, description = $description, type = $type, cost = $cost where id = $itemId'
        )
        .run({ itemId, ...data }).changes > 0
    )
  }

  deleteItem = (itemId: number) => {
    this.db.prepare('delete from service_items where id = $itemId').run({
      itemId
    })
  }

  savePaymentIntent = (intent: {
    service_id: number
    stripe_id: string
    applied_discount: number
  }) => {
    this.db
      .prepare(
        'insert into payment_intents(service_id, stripe_id, applied_discount) values($service_id, $stripe_id, $applied_discount)'
      )
      .run(intent)
  }

  dropPaymentIntent = (orderId: number) => {
    this.db
      .prepare('delete from payment_intents where service_id = $orderId')
      .run({ orderId })
  }

  getPaymentIntentByStripeId = (stripeId: string) => {
    return this.db
      .prepare(
        'select service_id order_id, applied_discount, created_at from payment_intents where stripe_id = $stripeId'
      )
      .get({ stripeId }) as {
      order_id: number
      applied_discount: number
      created_at: string
    } | null
  }

  getAllPaymentIntents = () => {
    return this.db
      .query('select service_id order_id, created_at from payment_intents')
      .all() as { order_id: number; created_at: string }[]
  }

  getPaymentIntent = (orderId: number) => {
    return this.db
      .prepare(
        'select stripe_id, created_at from payment_intents where service_id = $orderId'
      )
      .get({ orderId }) as { stripe_id: string; created_at: string } | null
  }

  findAllSubscriptions = () => {
    return this.db
      .query(
        `select s.id, s.status, s.user_id, from services s where s.is_recurring = true and s.id = in (select distinct service_id from payments) and s.status not in = (${STATUS.COMPLETED}, ${STATUS.CANCELLED})`
      )
      .all() as { id: number; status: number; user_id: string }[]
  }

  findByIdSummary = (id: number) => {
    return this.db
      .prepare(
        'select s.status, s.payment_installments installments, s.duration_weeks weeks, s.is_recurring, s.user_id, s.portfolio_consent from services s where s.id = $id'
      )
      .get({ id }) as {
      status: number
      installments: number
      weeks: number
      is_recurring: boolean
      portfolio_consent: boolean
      user_id: string
    } | null
  }

  findById = (id: number) => {
    return this.db
      .prepare(
        'select s.name, s.description, s.tag, s.user_id, u.name user_name, d.percentage discount_percentage, d.description discount_description, s.status, s.payment_installments, s.duration_weeks, s.is_recurring, s.portfolio_consent from services s left join users u on s.user_id = u.id left join service_discount d on s.id = d.service_id where s.id = $id'
      )
      .get({ id }) as {
      name: string
      description: string
      tag: string
      status: number
      user_id: string
      user_name: string
      payment_installments: number
      duration_weeks: number
      discount_percentage: number
      discount_description: string
      is_recurring: boolean
      portfolio_consent: boolean
    } | null
  }

  findDueForNextPayment = () => {
    return this.db
      .query(
        `select s.id, u.name user_name, u.email user_email, s.payment_installments, s.duration_weeks, ifnull(c.payments_count, 0) as payments_count, c.first_payment_created_at from services s join users u on s.user_id = u.id left join (select service_id, count(*) as payments_count, min(created_at) as first_payment_created_at from payments group by service_id) c on s.id = c.service_id where ifnull(c.payments_count, 0) < s.payment_installments and s.status in (${STATUS.DEVELOPMENT}, ${STATUS.PRODUCTION}, ${STATUS.MAINTENANCE}, ${STATUS.CLIENT_REVIEW}) and s.is_recurring = 0`
      )
      .all() as {
      id: number
      user_name: string
      user_email: string
      payment_installments: number
      duration_weeks: number
      payments_count: number
      first_payment_created_at: string
    }[]
  }

  findRecurringDueForNextPayment = () => {
    return this.db
      .query(
        `select s.id, p.last_payment_created_at from services s left join (select service_id, max(created_at) as last_payment_created_at from payments group by service_id) p on s.id = p.service_id where s.status in (${STATUS.DEVELOPMENT}, ${STATUS.PRODUCTION}, ${STATUS.MAINTENANCE}, ${STATUS.CLIENT_REVIEW}) and s.is_recurring = 1 and s.id not in (select service_id from pending_charges)`
      )
      .all() as {
      id: number
      last_payment_created_at: string
    }[]
  }

  getAllPendingCharges = () => {
    return this.db
      .query('select service_id id, attempt_count from pending_charges')
      .all() as Array<{ id: number; attempt_count: number }>
  }

  setPendingCharge = (id: number) => {
    this.db
      .prepare('insert into pending_charges (service_id) values ($id)')
      .run({
        id
      })
  }

  increaseAttemptsOnPendingCharge = (id: number) => {
    this.db
      .prepare(
        'update pending_charges set attempt_count = attempt_count + 1 where service_id = $id'
      )
      .run({
        id
      })
  }

  dropPendingCharge = (id: number) => {
    this.db.prepare('delete from pending_charges where service_id = $id').run({
      id
    })
  }

  findAll = (limit: number) => {
    return this.db
      .prepare(
        'select id, name, tag, status from services order by created_at desc limit $limit'
      )
      .all({
        limit
      })
  }

  findAllByStatus = (status: number, page?: number) => {
    const offset = page ? (page - 1) * QUERY_LIMIT : 0
    return this.db
      .prepare(
        'select id, name, tag, status from services where status = $status order by created_at desc limit $limit offset $offset'
      )
      .all({
        status,
        limit: QUERY_LIMIT,
        offset
      })
  }

  findAllByUser = (userId: string, limit = 100) => {
    return this.db
      .prepare(
        'select id, name, tag, status from services where user_id = $userId order by created_at desc limit $limit'
      )
      .all({
        userId,
        limit
      })
  }

  getUndoneCount = (userId: string) => {
    const res = this.db
      .prepare(
        `select count(id) count from services where user_id = $userId and status != ${ORDER_STATUSES.CANCELLED} and status != ${ORDER_STATUSES.COMPLETED}`
      )
      .get({
        userId
      }) as { count: number }

    return res?.count
  }
}

export default Order
