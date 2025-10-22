import { LEGAL, ROLES, SYSTEM_RESERVED_SECRETS_LABELS } from '@/lib/constants'
import { ForbiddenError } from '@/lib/errors'
import Database from 'bun:sqlite'

class User {
  db: Database

  constructor(db: Database) {
    this.db = db
  }

  getIdByEmail = (email: string) => {
    const res = this.db
      .prepare('select id from users where email = $email')
      .get({
        email
      }) as { id: string } | null
    return res?.id
  }

  findBySessionId = (sessionId: string) => {
    return this.db
      .prepare(
        'select u.id, u.email, u.name, u.role from sessions s left join users u on u.id = s.user_id where s.id = $sessionId and u.active = 1 and s.verified = 0'
      )
      .get({
        sessionId
      }) as {
      id: string
      email: string
      name: string
      role: number
    } | null
  }

  create = (user: {
    name: string
    email: string
    role: number
    password_hash: string
  }) => {
    const id = crypto.randomUUID()
    this.db
      .prepare(
        'insert into users(id, name, email, role, password_hash) values($id, $name, $email, $role, $password_hash)'
      )
      .run({ ...user, id })

    return id
  }

  saveConsents = (id: string, userAgent: string) => {
    const consents = {
      user_id: id,
      terms_v: LEGAL.TERMS.V,
      terms_hash: LEGAL.TERMS.HASH,
      policies_v: LEGAL.POLICIES.V,
      policies_hash: LEGAL.POLICIES.HASH,
      user_agent: userAgent
    }

    this.db
      .prepare(
        'insert into user_consents(user_id, terms_v, terms_hash, policies_v, policies_hash, user_agent) values($user_id, $terms_v, $terms_hash, $policies_v, $policies_hash, $user_agent)'
      )
      .run(consents)
  }

  createStripeCustomer = (id: string, customerId: string) => {
    this.db
      .prepare(
        'insert into user_stripe_customer (user_id, stripe_customer_id) values ($id, $customerId)'
      )
      .run({
        id,
        customerId
      })
  }

  dropStripeCustomer = (id: string) => {
    this.db
      .prepare('delete from user_stripe_customer where user_id = $id')
      .run({
        id
      })
  }

  getStripeCustomerId = (id: string) => {
    const res = this.db
      .prepare(
        'select stripe_customer_id customer from user_stripe_customer where user_id = $id'
      )
      .get({
        id
      }) as { customer: string } | null

    return res?.customer
  }

  getNameById = (id: string) => {
    const res = this.db
      .prepare(
        'select name from users where id = $id and active = 1 and email_verified = 1'
      )
      .get({
        id
      }) as { name: string } | null
    return res?.name
  }

  setPassword = (id: string, newPassword: string) => {
    return (
      this.db
        .prepare(
          'update users set password_hash = $newPassword where id = $id returning id'
        )
        .run({ id, newPassword }).changes > 0
    )
  }

  setEmail = (id: string, newEmail: string) => {
    return (
      this.db
        .prepare(
          'update users set email = $newEmail, email_verified = 0 where id = $id'
        )
        .run({
          id,
          newEmail
        }).changes > 0
    )
  }

  getRoleById = (id: string) => {
    const res = this.db
      .prepare(
        'select role from users where id = $id and active = 1 and email_verified = 1'
      )
      .get({
        id
      }) as { role: number } | null
    return res?.role
  }

  findById = (id: string) => {
    return this.db
      .prepare(
        'select name, email, email_verified verified, role, active from users where id = $id'
      )
      .get({
        id
      }) as {
      name: string
      email: string
      verified: boolean
      role: number
      active: boolean
    } | null
  }

  findByEmail = (email: string) => {
    return this.db
      .prepare(
        'select id, name, password_hash hash, email_verified verified from users where email = $email and active = 1'
      )
      .get({
        email
      }) as {
      id: string
      name: string
      hash: string
      verified: boolean
    } | null
  }

  findByVerifiedSession = (sessionId: string) => {
    return this.db
      .prepare(
        'select u.id, u.role from users u right join sessions s on u.id = s.user_id where s.id = $sessionId and u.active = 1 and s.verified = 1'
      )
      .get({
        sessionId
      }) as {
      id: string
      role: number
    } | null
  }

  // TODO: Review behaviour
  findAll = (ignore: string, role = ROLES.CLIENT) => {
    return this.db
      .prepare(
        'select id, name, role from users where id != $ignore and active = 1 and role = $role'
      )
      .all({
        ignore,
        role
      }) as { id: string; name: string; role: number }[]
  }

  getAllClientNames = () => {
    return this.db
      .query(
        `select id, name from users where active = 1 and email_verified = 1 and role = ${ROLES.CLIENT}`
      )
      .all() as { id: string; name: string }[]
  }

  verifyEmail = (id: string) => {
    return (
      this.db
        .prepare('update users set email_verified = 1 where id = $id')
        .run({
          id
        }).changes > 0
    )
  }

  getFacturaClient = (userId: string) => {
    return this.db
      .prepare(
        'select factura_client_id, is_foreign, cfdi_use from user_factura where user_id = $userId'
      )
      .get({
        userId
      }) as {
      factura_client_id: string
      is_foreign: boolean
      cfdi_use: string
    } | null
  }

  saveFacturaClient = (client: {
    user_id: string
    factura_client_id: string
    is_foreign: boolean
    cfdi_use: string
  }) => {
    this.db
      .prepare(
        'insert into user_factura(user_id, factura_client_id, is_foreign, cfdi_use) values($user_id, $factura_client_id, $is_foreign, $cfdi_use)'
      )
      .run(client)
  }

  deleteFacturaClient = (userId: string) => {
    this.db.prepare('delete from user_factura where user_id = $userId').run({
      userId
    })
  }

  deactivate = (id: string) => {
    this.db.prepare('update users set active = false where id = $id').run({
      id
    })
  }

  saveKey = (id: string, key: string) => {
    this.db
      .prepare('insert into user_keys (user_id, key) values ($id, $key)')
      .run({
        id,
        key
      })
  }

  getKey = (id: string) => {
    const res = this.db
      .prepare('select key from user_keys where user_id = $id')
      .get({
        id
      }) as { key: string } | null

    return res?.key
  }

  dropKey = (id: string) => {
    this.db.prepare('delete from user_keys where user_id = $id').run({
      id
    })
  }

  saveSecret = (data: {
    label: string
    key: string
    content: string
    iv: string
    author_id: string
    receiver_id: string
  }) => {
    if (SYSTEM_RESERVED_SECRETS_LABELS.includes(data.label)) {
      throw new ForbiddenError('Esta etiqueta esta reservada para uso interno')
    }

    return this.db
      .prepare(
        'insert into user_secrets(label, key, content, iv, author_id, receiver_id) values($label, $key, $content, $iv, $author_id, $receiver_id) returning id, updated_at'
      )
      .get(data) as { id: number; updated_at: string }
  }

  saveContractComplement = (
    secrets: Array<{
      label: string
      key: string
      content: string
      iv: string
      author_id: string
      receiver_id: string
    }>
  ) => {
    const query = this.db.prepare(
      'insert into user_secrets(label, key, content, iv, author_id, receiver_id) values($label, $key, $content, $iv, $author_id, $receiver_id) returning id, updated_at'
    )

    const save = this.db.transaction(secrets => {
      for (const secret of secrets) query.run(secret)
    })

    save(secrets)
  }

  updateSecret = (userId: string, id: number, secret: string) => {
    this.db
      .prepare(
        'update user_secrets set content = $secret, updated_at = current_timestamp where id = $id and author_id = $userId'
      )
      .run({
        secret,
        id,
        userId
      })
  }

  dropSecret = (userId: string, id: number) => {
    this.db
      .prepare(
        'delete from user_secrets where id = $id and author_id = $userId'
      )
      .run({
        id,
        userId
      })
  }

  clearSecrets = (receiver: string) => {
    this.db
      .prepare('delete from user_secrets where receiver_id = $receiver')
      .run({
        receiver
      })
  }

  dropContractComplement = (userId: string) => {
    this.db
      .prepare(
        'delete from user_secrets where author_id = $client and label in ("cc_legal_name", "cc_rfc", "cc_fullname", "cc_address", "cc_role")'
      )
      .run({
        client: userId
      })
  }

  getContractComplement = (client: string, admin: string) => {
    const secrets = this.db
      .prepare(
        'select id, label, key, content, iv, updated_at from user_secrets where author_id = $client and receiver_id = $admin and label in ("cc_legal_name", "cc_rfc", "cc_fullname", "cc_address", "cc_role")'
      )
      .all({
        client,
        admin
      }) as Array<{
      id: number
      label: string
      key: string
      content: string
      iv: string
      updated_at: Date
    }> | null

    if (secrets?.length !== 5) return null

    const data = secrets.reduce(
      (acc, secret) => {
        const { label, ...rest } = secret
        acc[
          label.split('cc_')[1] as 'legal_name' | 'rfc' | 'fullname' | 'address'
        ] = rest

        return acc
      },
      {} as Record<
        'legal_name' | 'rfc' | 'fullname' | 'address',
        {
          id: number
          key: string
          content: string
          iv: string
          updated_at: Date
        }
      >
    )

    return data
  }

  getSecrets = (author: string, receiver: string) => {
    return this.db
      .prepare(
        'select id, label, key, content, iv, updated_at from user_secrets where author_id = $author and receiver_id = $receiver'
      )
      .all({
        author,
        receiver
      }) as Array<{
      id: number
      label: string
      key: string
      content: string
      iv: string
      updated_at: Date
    }>
  }

  getSecretsAsReceiver = (receiver: string) => {
    return this.db
      .prepare(
        'select id, label, key, content, iv, updated_at from user_secrets where receiver_id = $receiver'
      )
      .all({
        receiver
      }) as Array<{
      id: number
      label: string
      key: string
      content: string
      iv: string
      updated_at: Date
    }>
  }

  getSecretsAsAuthor = (author: string) => {
    return this.db
      .prepare(
        'select id, label, key, content, iv, updated_at from user_secrets where author_id = $author and label not in ("cc_legal_name", "cc_rfc", "cc_fullname", "cc_address", "cc_role")'
      )
      .all({
        author
      }) as Array<{
      id: number
      label: string
      key: string
      content: string
      iv: string
      updated_at: Date
    }>
  }
}

export default User
