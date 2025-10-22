import { ROLES } from '@/lib/constants'
import {
  AuthError,
  ForbiddenError,
  RouteProtectionError,
  UserNotVerifiedError
} from '@/lib/errors'
import models from '@/models/sqlite'

class SessionsService {
  static async login(
    email: string,
    password: string
  ): Promise<{
    code: { id: string; value: number }
    user: { id: string; name: string; hash: string; verified: boolean }
  }> {
    const user = models.user.findByEmail(email)
    if (!user) throw new AuthError()
    if (!user.verified) {
      throw new UserNotVerifiedError({ id: user.id, name: user.name, email })
    }

    const match = await Bun.password.verify(password, user.hash)
    if (!match) throw new AuthError()

    // NOTE: Consider using a transaction
    models.session.deleteAll(user.id)

    const sessionId = models.session.create(user.id)
    const newCode = models.session.createCode(sessionId)

    return { code: newCode, user }
  }

  static regenerateCode(codeId: string): {
    user: { id: string; name: string; email: string }
    code: { id: string; value: number }
  } {
    const sessionId = models.session.getIdByCodeId(codeId)
    if (!sessionId) throw new AuthError()

    const user = models.user.findBySessionId(sessionId)
    if (!user) throw new AuthError()

    models.session.dropCode(codeId)

    const newCode = models.session.createCode(sessionId)

    return { user, code: newCode }
  }

  static verify(code: { id: string; value: string }): {
    session: { id: string }
    user: {
      billingRequired: boolean
      email: string
      name: string
      role: number
    }
  } {
    const sessionId = models.session.getIdByCodeId(code.id)
    if (!sessionId) throw new AuthError()

    const codeCreatedAt = models.session.getCodeTimestamp(code)
    if (!codeCreatedAt) throw new AuthError()

    models.session.dropCode(code.id)

    if (Date.now() - new Date(codeCreatedAt).getTime() > 1000 * 60 * 5) {
      throw new ForbiddenError('Código expirado')
    }

    const user = models.user.findBySessionId(sessionId)
    if (!user) throw new AuthError() // NOTE: Never happens

    models.session.verify(sessionId)

    let billingRequired = false
    if (user.role === ROLES.CLIENT) {
      billingRequired = models.user.getFacturaClient(user.id) === undefined
    }

    return {
      session: { id: sessionId },
      user: {
        billingRequired,
        email: user.email,
        name: user.name,
        role: user.role
      }
    }
  }

  static validateCredentials(sessionId: string): {
    user: { id: string; role: number }
  } {
    const session = models.session.findById(sessionId)
    if (!session) throw new RouteProtectionError()

    if (
      Date.now() - new Date(session.created_at).getTime() >
      1000 * 60 * 60 * 24 * 30
    ) {
      models.session.drop(sessionId)
      throw new ForbiddenError('SESSION_EXPIRED')
    }

    const role = models.user.getRoleById(session.user_id)
    if (!role) throw new RouteProtectionError()

    return {
      user: {
        id: session.user_id,
        role
      }
    }
  }
}

export default SessionsService
