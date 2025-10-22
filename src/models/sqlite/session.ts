import { newCode } from '@/lib/utils'
import Database from 'bun:sqlite'

class Session {
  db: Database

  constructor(db: Database) {
    this.db = db
  }

  deleteAll = (userId: string) => {
    this.db.prepare('delete from sessions where user_id = $userId').run({
      userId
    })
  }

  dropCode = (id: string) => {
    this.db.prepare('delete from session_code where id = $id').run({
      id
    })
  }

  getCodes = () => {
    return this.db.prepare('select id, created_at from session_code').all() as {
      id: string
      created_at: string
    }[]
  }

  getIdByCodeId = (codeId: string) => {
    const res = this.db
      .prepare('select session_id from session_code where id = $codeId')
      .get({ codeId }) as { session_id: string } | null
    return res?.session_id
  }

  findAllActive = () => {
    return this.db
      .prepare('select id, created_at from sessions where verified = 1')
      .all() as { id: string; created_at: string }[]
  }

  create = (userId: string) => {
    const id = crypto.randomUUID()
    this.db
      .prepare('insert into sessions (id, user_id) values ($id, $userId)')
      .run({ id, userId })
    return id
  }

  drop = (id: string) => {
    this.db.prepare('delete from sessions where id = $id').run({ id })
  }

  verify = (id: string) => {
    return (
      this.db
        .prepare('update sessions set verified = true where id = $id')
        .run({ id }).changes > 0
    )
  }

  createCode = (session: string) => {
    const id = crypto.randomUUID()
    const code = newCode()
    this.db
      .prepare(
        'insert into session_code (id, code, session_id) values ($id, $code, $session)'
      )
      .run({ id, code, session })

    return { id, value: code }
  }

  getCodeTimestamp = (code: { id: string; value: string }) => {
    const res = this.db
      .prepare(
        'select created_at from session_code where id = $id and code = $value'
      )
      .get({ id: code.id, value: code.value }) as { created_at: string } | null
    return res?.created_at
  }

  findById = (id: string) => {
    return this.db
      .prepare(
        'select user_id, created_at from sessions where id = $id and verified = 1'
      )
      .get({ id }) as { user_id: string; created_at: string } | null
  }
}

export default Session
