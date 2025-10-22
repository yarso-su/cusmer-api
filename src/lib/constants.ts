import { CookieOptions } from 'elysia'
import { PaymentMeans } from './types'

export const PRODUCTION = Bun.env.ENVIRONMENT === 'production'

// IMPORTANT: Replace this with your domain
export const DOMAIN = '.your-domain.com'

const {
  REFRESH_SECRET,
  LOGGER_SECRET,
  ACCESS_SECRET,
  REGISTER_USER_SECRET,
  VERIFICATION_SECRET,
  PASSWORD_RESET_SECRET,
  EMAIL_UPDATE_SECRET,
  CHAT_SECRET,
  FACTURA_API_KEY,
  FACTURA_SECRET_KEY,
  FACTURA_GENERIC_CLIENT_ID,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  CLIENT_URL,
  PORT,
  DB_URL,
  ADMIN_EMAIL_ADDRESS,
  TERMS_V,
  TERMS_HASH,
  POLICIES_V,
  POLICIES_HASH,
  LEGAL_HASHES_REPOSITORY_URL
} = Bun.env

if (!LEGAL_HASHES_REPOSITORY_URL) {
  throw new Error('Legal hashes repository url not found')
}

export const LEGAL_REPOSITORY_URL = LEGAL_HASHES_REPOSITORY_URL

if (!PORT || !CLIENT_URL || !DB_URL) {
  throw new Error('Environment variables not found')
}
export const PROCESS_PORT = PORT
export const CLIENT = CLIENT_URL
export const DATABASE_URL = DB_URL

if (
  !REFRESH_SECRET ||
  !LOGGER_SECRET ||
  !ACCESS_SECRET ||
  !REGISTER_USER_SECRET ||
  !VERIFICATION_SECRET ||
  !PASSWORD_RESET_SECRET ||
  !EMAIL_UPDATE_SECRET ||
  !CHAT_SECRET
) {
  throw new Error('Secrets not found')
}

export const SECRETS = {
  REFRESH: REFRESH_SECRET,
  LOGGER: LOGGER_SECRET,
  ACCESS: ACCESS_SECRET,
  REGISTER_USER: REGISTER_USER_SECRET,
  VERIFICATION: VERIFICATION_SECRET,
  PASSWORD_RESET: PASSWORD_RESET_SECRET,
  EMAIL_UPDATE: EMAIL_UPDATE_SECRET,
  STRIPE: STRIPE_SECRET_KEY,
  CHAT: CHAT_SECRET
}

if (!FACTURA_API_KEY || !FACTURA_SECRET_KEY || !FACTURA_GENERIC_CLIENT_ID) {
  throw new Error('Factura Credentials not found')
}

export const FACTURA = {
  API_KEY: FACTURA_API_KEY,
  SECRET_KEY: FACTURA_SECRET_KEY,
  GENERIC_CLIENT_ID: FACTURA_GENERIC_CLIENT_ID
}

export const ROLES = {
  ADMIN: 1,
  DEV: 2,
  CLIENT: 3
}

if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
  throw new Error('Stripe Credentials not found')
}

export const STRIPE = {
  SECRET_KEY: STRIPE_SECRET_KEY,
  WEBHOOK_SECRET: STRIPE_WEBHOOK_SECRET
}

export const ORDER_STATUSES = {
  PLANNING: 1,
  PAYMENT_REQUIRED: 2,
  DEVELOPMENT: 3,
  PRODUCTION: 4,
  MAINTENANCE: 5,
  CLIENT_REVIEW: 6,
  ON_HOLD: 7,
  ARCHIVED: 8,
  CANCELLED: 9,
  COMPLETED: 10
}

export const ORDER_INMUTABLE_STATUS = [
  ORDER_STATUSES.CANCELLED,
  ORDER_STATUSES.COMPLETED
]

export const PAYMENT_MEANS: Record<string, PaymentMeans> = {
  transfer: '03',
  credit: '04',
  debit: '28',
  unknown: '99'
}

export const THREAD_STATUSES = {
  OPEN: 1,
  ARCHIVED: 2,
  CLOSED: 3
}

if (!ADMIN_EMAIL_ADDRESS) {
  throw new Error('Admin email not found')
}

export const ADMIN_EMAIL = ADMIN_EMAIL_ADDRESS

if (!TERMS_V || !TERMS_HASH || !POLICIES_V || !POLICIES_HASH) {
  throw new Error('Terms and Policies not found')
}

export const LEGAL = {
  TERMS: {
    V: TERMS_V,
    HASH: TERMS_HASH
  },
  POLICIES: {
    V: POLICIES_V,
    HASH: POLICIES_HASH
  }
}

export const QUERY_LIMIT = 30

export const ORDER_ITEM_KEYS = [
  '00000000',
  '81112106',
  '81111800',
  '81161501',
  '81111509',
  '81111510',
  '81111707',
  '81111705',
  '81111704',
  '81112103',
  '81111500',
  '81111508',
  '81111504',
  '81111820',
  '81112220',
  '81112200',
  '81112202',
  '81111811',
  '81111808',
  '81111806',
  '81111502',
  '81111503',
  '81111810',
  '81111700',
  '80111621',
  '81141901',
  '81141902',
  '81112209',
  '80121604'
]

export const CUSTOM_HEADERS = {
  ERROR: 'works-error-message',
  MESSAGE: 'works-message',
  EMAIL_SENT: 'works-email-sent'
}

export const ORDER_STATUSES_WHICH_REQUIRE_PAYMENT = [
  ORDER_STATUSES.DEVELOPMENT,
  ORDER_STATUSES.PRODUCTION,
  ORDER_STATUSES.MAINTENANCE,
  ORDER_STATUSES.CLIENT_REVIEW
]

export const ACCESS_COOKIE_CONF: CookieOptions = {
  secure: true,
  httpOnly: true,
  sameSite: 'none',
  path: '/',
  domain: DOMAIN,
  maxAge: 60 * 3
}

export const VALID_REGIMENS_FOR_GO3 = [
  '601',
  '603',
  '606',
  '612',
  '620',
  '621',
  '622',
  '623',
  '624',
  '625',
  '626'
]

export const SYSTEM_RESERVED_SECRETS_LABELS = [
  'cc_legal_name',
  'cc_rfc',
  'cc_fullname',
  'cc_address',
  'cc_role'
]

const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ENDPOINT } =
  Bun.env

if (
  !R2_ACCESS_KEY_ID ||
  !R2_SECRET_ACCESS_KEY ||
  !R2_BUCKET_NAME ||
  !R2_ENDPOINT
) {
  throw new Error('R2 Credentials not found')
}

export const R2 = {
  ACCESS_KEY_ID: R2_ACCESS_KEY_ID,
  SECRET_ACCESS_KEY: R2_SECRET_ACCESS_KEY,
  BUCKET_NAME: R2_BUCKET_NAME,
  ENDPOINT: R2_ENDPOINT
}

const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_ACCOUNT_ID } = Bun.env

if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_ACCOUNT_ID) {
  throw new Error('Zoho Credentials not found')
}

export const ZOHO = {
  CLIENT_ID: ZOHO_CLIENT_ID,
  CLIENT_SECRET: ZOHO_CLIENT_SECRET,
  ACCOUNT_ID: ZOHO_ACCOUNT_ID
}
