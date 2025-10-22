const createErrorFactory = function (name: string) {
  return class BusinessError extends Error {
    constructor(message: string) {
      super(message)
      this.name = name
    }
  }
}

export const ValidationError = createErrorFactory('ValidationError')
export const ForbiddenError = createErrorFactory('ForbiddenError')
export const NotFoundError = createErrorFactory('NotFoundError')

export class AuthError extends Error {
  constructor() {
    super('Unauthorized')
    this.name = 'AuthError'
  }
}

export class StripeCardError extends Error {
  order: { id: number }
  user: { name: string; email: string }

  constructor(order: { id: number }, user: { name: string; email: string }) {
    super('Error while processing the payment')
    this.name = 'StripeCardError'
    this.order = order
    this.user = user
  }
}

export class UserNotVerifiedError extends Error {
  user: { id: string; name: string; email: string }

  constructor(user: { id: string; name: string; email: string }) {
    super('User not verified')
    this.name = 'UserNotVerifiedError'
    this.user = user
  }
}

export class ServiceError extends Error {
  service: string
  originalError: any

  constructor(service: string, error: any) {
    super('A service error has occurred')
    this.name = 'ServiceError'
    this.service = service
    this.originalError = error
  }
}

export class RouteProtectionError extends Error {
  constructor() {
    super('Missing or invalid credentials')
    this.name = 'RouteProtectionError'
  }
}
