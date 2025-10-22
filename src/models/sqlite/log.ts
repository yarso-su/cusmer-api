import Database from 'bun:sqlite'

class Internal {
  db: Database

  constructor(db: Database) {
    this.db = db
  }

  save = (log: { origin: string; content: string }) => {
    const id = this.db
      .prepare(
        'insert into internal_logs(origin, content) values($origin, $content) returning id'
      )
      .run(log).lastInsertRowid
    return id
  }

  findAll = () => {
    const logs = this.db
      .prepare(
        'select origin, content, created_at from internal_logs order by created_at desc limit 30'
      )
      .all()
    return logs
  }
}

export default Internal
