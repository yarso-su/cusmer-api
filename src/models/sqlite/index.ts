import User from './user'
import Session from './session'
import Order from './order'
import Payment from './payment'
import Thread from './thread'
import Log from './log'
import Internal from './internal'
import Database from 'bun:sqlite'
import { DATABASE_URL } from '@/lib/constants'

export class Models {
  db: Database
  session: Session
  user: User
  order: Order
  payment: Payment
  thread: Thread
  log: Log
  internal: Internal

  constructor(db: Database) {
    this.db = db
    this.user = new User(db)
    this.session = new Session(db)
    this.order = new Order(db)
    this.payment = new Payment(db)
    this.thread = new Thread(db)
    this.log = new Log(db)
    this.internal = new Internal(db)
  }
}

const db = new Database(DATABASE_URL, {
  strict: true
})
const models = new Models(db)

export default models
