import { QUERY_LIMIT, THREAD_STATUSES } from '@/lib/constants'
import Database from 'bun:sqlite'

class Thread {
  db: Database

  constructor(db: Database) {
    this.db = db
  }

  getUserId = (id: number) => {
    const res = this.db
      .prepare('select user_id from threads where id = $id')
      .get({ id }) as { user_id: string } | null

    return res?.user_id
  }

  saveAttachment = (attachment: {
    filename: string
    user_id: string
    thread_id: number
  }) => {
    const res = this.db
      .prepare(
        'insert into thread_attachments(filename, user_id, thread_id) values($filename, $user_id, $thread_id) returning created_at'
      )
      .get(attachment) as { created_at: string }

    return res.created_at
  }

  getAttachmentUserId = (filename: string) => {
    const res = this.db
      .prepare(
        'select user_id from thread_attachments where filename = $filename'
      )
      .get({
        filename
      }) as { user_id: string } | null

    return res?.user_id
  }

  getAttachments = (id: number) => {
    return this.db
      .prepare(
        'select filename, user_id, created_at from thread_attachments where thread_id = $id order by created_at'
      )
      .all({
        id
      }) as {
      filename: string
      user_id: string
      created_at: string
    }[]
  }

  getAttachmentsCount = (id: number) => {
    const res = this.db
      .prepare(
        'select count(filename) count from thread_attachments where thread_id = $id'
      )
      .get({
        id
      }) as { count: number } | null

    return res?.count ?? 0
  }

  dropAttachments = (id: number) => {
    this.db
      .prepare('delete from thread_attachments where thread_id = $id')
      .run({
        id
      })
  }

  dropAttachment = (filename: string) => {
    this.db
      .prepare('delete from thread_attachments where filename = $filename')
      .run({
        filename
      })
  }

  getOwner = (id: number) => {
    const res = this.db
      .prepare(
        'select t.user_id id, u.name, u.email from threads t join users u on t.user_id = u.id where t.id = $id'
      )
      .get({
        id
      }) as { id: string; name: string; email: string } | null
    return res
  }

  getStatusById = (id: number) => {
    const res = this.db
      .prepare('select status from threads where id = $id')
      .get({
        id
      }) as { status: number } | null
    return res?.status
  }

  save = (thread: { user_id: string; name: string; type: number }) => {
    const res = this.db
      .prepare(
        'insert into threads(user_id, name, type) values($user_id, $name, $type) returning id'
      )
      .get(thread) as { id: number }
    return res.id
  }

  saveMessage = (message: {
    thread_id: number
    user_id: string
    content: string
  }) => {
    const res = this.db
      .prepare(
        'insert into thread_messages(thread_id, user_id, content) values($thread_id, $user_id, $content) returning created_at'
      )
      .get(message) as { created_at: string }
    return res.created_at
  }

  saveOrder = (order: { thread_id: number; service_id: number }) => {
    this.db
      .prepare(
        'insert into thread_service(thread_id, service_id) values($thread_id, $service_id)'
      )
      .run(order)
  }

  setOrder = (relation: { thread_id: number; service_id: number }) => {
    this.db
      .prepare(
        'insert into thread_service(thread_id, service_id) values($thread_id, $service_id)'
      )
      .run(relation)
  }

  removeOrder = (threadId: number) => {
    this.db
      .prepare('delete from thread_service where thread_id = $threadId')
      .run({ threadId })
  }

  update = (
    threadId: number,
    data: {
      name: string
      type: number
      status: number
    }
  ) => {
    this.db
      .prepare(
        'update threads set name = $name, type = $type, status = $status where id = $threadId'
      )
      .run({ threadId, ...data })
  }

  // TODO: Review behaviour
  findAllByUser = (
    userId: string,
    limit = 100,
    status = THREAD_STATUSES.OPEN
  ) => {
    return this.db
      .prepare(
        'select id, name, type, status from threads where user_id = $userId and status = $status order by created_at desc limit $limit'
      )
      .all({ userId, status, limit }) as {
      id: number
      name: string
      type: number
      status: number
    }[]
  }

  findAllByOrder = (orderId: number) => {
    return this.db
      .prepare(
        'select t.id, t.name, t.type, t.status from thread_service s left join threads t on s.thread_id = t.id where s.service_id = $orderId order by t.created_at desc'
      )
      .all({
        orderId
      }) as {
      id: number
      name: string
      type: number
      status: number
    }[]
  }

  // TODO: Review behaviour
  findAll = (limit: number, status = THREAD_STATUSES.OPEN) => {
    return this.db
      .prepare(
        'select id, name, type from threads where status = $status order by created_at desc limit $limit'
      )
      .all({
        limit,
        status
      }) as {
      id: number
      name: string
      type: number
    }[]
  }

  findAllByStatus = (status: number, page = 1) => {
    const offset = page ? (page - 1) * QUERY_LIMIT : 0
    return this.db
      .prepare(
        'select id, name, type from threads where status = $status order by created_at desc limit $limit offset $offset'
      )
      .all({
        limit: QUERY_LIMIT,
        offset,
        status
      }) as {
      id: number
      name: string
      type: number
    }[]
  }

  findById = (id: number) => {
    return this.db
      .prepare(
        'select t.id, t.name, t.type, t.status from threads t where t.id = $id'
      )
      .get({
        id
      }) as {
      id: number
      name: string
      type: number
      status: number
    } | null
  }

  getOrderById = (id: number) => {
    const res = this.db
      .prepare('select service_id from thread_service where thread_id = $id')
      .get({ id }) as { service_id: number } | null
    return res?.service_id
  }

  getUndoneCount = (userId: string) => {
    const res = this.db
      .prepare(
        `select count(id) count from threads where status = ${THREAD_STATUSES.OPEN} and  user_id = $userId`
      )
      .get({ userId }) as { count: number }
    return res.count
  }

  getMessages = (threadId: number) => {
    const res = this.db
      .prepare(
        'select m.content, m.user_id, u.name, m.created_at from thread_messages m left join users u on m.user_id = u.id where m.thread_id = $threadId order by m.created_at asc'
      )
      .all({
        threadId
      }) as {
      content: string
      user_id: string
      name: string
      created_at: string
    }[]

    const messages = res.map((message: any) => ({
      content: message.content,
      user: {
        id: message.user_id,
        name: message.name
      },
      createdAt: message.created_at
    }))

    return messages
  }
}

export default Thread
