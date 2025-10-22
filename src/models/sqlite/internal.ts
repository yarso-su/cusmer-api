import Database from 'bun:sqlite'

class Internal {
  db: Database

  constructor(db: Database) {
    this.db = db
  }

  saveOperatingCost = (data: { amount: number; note: string }) => {
    const id = this.db
      .prepare(
        'insert into operating_costs(amount, note) values($amount, $note)'
      )
      .run(data).lastInsertRowid
    return id
  }

  dropOperatingCost = (id: number) => {
    this.db.prepare('delete from operating_costs where id = $id').run({ id })
  }

  getOperatingCosts = () => {
    return this.db.prepare('select * from operating_costs').all()
  }
}

export default Internal
