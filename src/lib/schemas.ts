import { t } from 'elysia'

// const uuidV4Regex =
//   /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const Uuid = t.String({
  format: 'uuid',
  // pattern: uuidV4Regex.source,
  errorMessage: {
    pattern: 'Invalid UUID'
  }
})

export const Name = t.String({
  trim: true,
  maxLength: 60,
  minLength: 3
})

export const Email = t.String({
  trim: true,
  format: 'email'
})

export const Password = t.String({
  minLength: 12,
  pattern:
    '(?=^.{8,}$)((?=.*\\d)|(?=.*\\W+))(?![.\\n])(?=.*[A-Z])(?=.*[a-z]).*$',
  description:
    'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
})

export const Role = t.Integer({
  minimum: 1,
  maximum: 3
})

export const ItemType = t.Integer({
  minimum: 1,
  maximum: 3
})

export const ItemStatus = t.Integer({
  minimum: 1,
  maximum: 3
})

export const FacturaClient = t.Object({
  rfc: t.String(),
  razons: t.String(),
  codpos: t.Integer(),
  email: t.String(),
  regimen: t.String(),
  // pais: t.String(),
  calle: t.Optional(t.String()),
  numero_exterior: t.Optional(t.String()),
  numero_interior: t.Optional(t.String()),
  colonia: t.Optional(t.String()),
  ciudad: t.Optional(t.String()),
  delegacion: t.Optional(t.String()),
  localidad: t.Optional(t.String()),
  estado: t.Optional(t.String()),
  nombre: t.Optional(t.String()),
  apellidos: t.Optional(t.String()),
  telefono: t.Optional(t.String()),
  email2: t.Optional(t.String()),
  email3: t.Optional(t.String())
})

export const FacturaForeignClient = t.Object({
  razons: t.String(),
  codpos: t.Integer(),
  email: t.String(),
  pais: t.String()
})

export const ThreadType = t.Integer({
  minimum: 1,
  maximum: 11
})

export const ThreadStatus = t.Integer({
  minimum: 1,
  maximum: 3
})
