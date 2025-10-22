import { CLIENT, ZOHO } from './constants'
import { ServiceError } from './errors'

// IMPORTANT: This can be simplified with my Zoho Mail Package. https://github.com/yarso-su/zoho-mail

type Attach =
  | {
      code?: undefined
      link: { url: string; text: string }
    }
  | {
      code: number | string
      link?: undefined
    }
  | undefined

class Zoho {
  private accountId: string
  private clientId: string
  private clientSecret: string

  private access: null | {
    expires: number
    token: string
  } = null

  constructor(accountId: string, clientId: string, clientSecret: string) {
    this.accountId = accountId
    this.clientId = clientId
    this.clientSecret = clientSecret
  }

  private async getAccess() {
    if (this.access && this.access.expires > Date.now()) {
      return this.access.token
    }

    try {
      const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          scope: 'ZohoMail.messages.CREATE'
        })
      })

      if (!res.ok) {
        throw new Error('Error sending email')
      }

      const body = await res.json()

      this.access = {
        expires: Date.now() + body.expires_in * 1000,
        token: body.access_token
      }

      return this.access.token
    } catch (err) {
      throw new ServiceError('Zoho', err)
    }
  }

  private async send(toAddress: string, subject: string, content: string) {
    const access = await this.getAccess()

    try {
      const res = await fetch(
        `https://mail.zoho.com/api/accounts/${this.accountId}/messages`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Zoho-oauthtoken ${access}`
          },
          body: JSON.stringify({
            fromAddress: 'App bot <bot@your-domain.com>', // IMPORTANT: Replace this with your email, and change the alias to your own
            toAddress,
            subject,
            content
          })
        }
      )

      if (!res.ok) {
        const body = await res.json()
        console.log('body', body)
        throw new Error('Error sending email')
      }
    } catch (err) {
      throw new ServiceError('Zoho', err)
    }
  }

  code = async (to: string, name: string, value: number) => {
    await this.send(
      to,
      'Código de autenticación',
      this.html(
        name,
        'Este es tu código de verificación para continuar con el proceso de inicio de sesión.',
        {
          code: value
        }
      )
    )
  }

  verify = async (
    to: string,
    name: string,
    token: string
  ): Promise<boolean> => {
    try {
      await this.send(
        to,
        'Confirmación de correo electrónico',
        this.html(
          name,
          'Por favor, haz click en el botón de abajo para confirmar tu correo electrónico.',
          {
            link: {
              url: `${CLIENT}/account/verify-email?token=${token}`,
              text: 'Confirmar correo electrónico'
            }
          },
          'Si no reconoces esta solicitud, por favor, ignora este correo.'
        )
      )

      return true
    } catch (err) {
      return false
    }
  }

  register = async (to: string, token: string) => {
    await this.send(
      to,
      'Confirmación de registro',
      this.html(
        'Estimado/a',
        'Por favor, haz click en el botón de abajo para completar el proceso de registro.',
        {
          link: {
            url: `${CLIENT}/account/register?token=${token}`,
            text: 'Completar registro'
          }
        },
        'Si no reconoces esta solicitud, por favor, ignora este correo.'
      )
    )
  }

  passwordReset = async (to: string, name: string, token: string) => {
    await this.send(
      to,
      'Actualización de contraseña',
      this.html(
        name,
        'Parece que has solicitado una actualización de tu contraseña. Por favor, haz click en el botón de abajo para completar el proceso.',
        {
          link: {
            url: `${CLIENT}/account/reset-password?token=${token}`,
            text: 'Actualizar contraseña'
          }
        },
        'Si no reconoces esta solicitud, por favor, ignora este correo.'
      )
    )
  }

  updateEmail = async (to: string, name: string, token: string) => {
    await this.send(
      to,
      'Actualización de correo electrónico',
      this.html(
        name,
        'Parece que has solicitado una actualización de tu correo electrónico. Por favor, haz click en el botón de abajo para completar el proceso.',
        {
          link: {
            url: `${CLIENT}/account/update-email?token=${token}`,
            text: 'Actualizar correo electrónico'
          }
        },
        'Si no reconoces esta solicitud, por favor, ignora este correo.'
      )
    )
  }

  message = async (
    to: string,
    name: string,
    message: string,
    attach?: Attach
  ): Promise<boolean> => {
    try {
      await this.send(
        to,
        'Notificación de App', // IMPORTANT: Replace this with your app name
        this.html(name, message, attach)
      )

      return true
    } catch (err) {
      console.error('Message method of Zoho', err)

      return false
    }
  }

  // IMPORTANT: The next html template has a hardcoded title. You can change it to your own.

  private html = (
    name: string,
    message: string,
    attach?: Attach,
    additional?: string
  ) => {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title></title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding: 8px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px;">
          <tr>
            <td style="border: 1px solid #eaeaea; border-radius: 4px;"> 

              <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px;">
                <tr>
                  <td align="center">
                    <p style="padding: 0; margin: 0; padding-top: 48px; padding-bottom: 32px; font-size: 18px;"><strong>App</strong> by your-domain/name<strong>.</strong></p>
                  </td>
                </tr>
              </table>

              <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px;">
                <tr>
                  <td align="left">
                    <p style="padding: 0; margin: 0; padding-bottom: 24px; padding-left: 16px; padding-right: 16px; font-size: 14px;">Hola <strong>${name}</strong>,</p>
                  </td>
                </tr>
              </table>

              <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px;">
                <tr>
                  <td align="left">
                    <p style="padding: 0; margin: 0; padding-left: 16px; padding-right: 16px; font-size: 14px;">${message}</p>
                  </td>
                </tr>
              </table>

              ${
                attach?.code !== undefined
                  ? `<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px;">
                <tr>
                  <td align="center">
                    <p style="padding: 0; margin: 0; margin-top: 48px; margin-bottom: 48px; color: #2b7fff; font-weight: bold; font-size: 18px">
                      ${attach.code}
                    </p>
                  </td>
                </tr>
              </table>`
                  : ''
              }

              ${
                attach?.link !== undefined
                  ? `<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px;">
                <tr>
                  <td align="center">
                    <p style="padding: 0; margin: 0; margin-top: 48px; margin-bottom: 48px;">
<a target="_blank" href="${attach.link.url}" style="text-decoration: none; background-color: #2b7fff; color: #fff; padding: 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">${attach.link.text}</a>
                    </p>
                  </td>
                </tr>
              </table>`
                  : ''
              }

              ${
                additional !== undefined
                  ? `<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px;">
                <tr>
                  <td align="left">
                    <p style="padding: 0; margin: 0; padding-bottom: 12px; padding-left: 16px; padding-right: 16px; font-size: 14px;">${additional}</p>
                  </td>
                </tr>
              </table>`
                  : ''
              }

              <hr style="border: none; border-top: 1px solid #eaeaea; margin: 12px;">

              <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px;">
                <tr>
                  <td align="left">
                    <p style="padding: 0; margin: 0; padding-top: 12px; padding-left:16px; padding-right: 16px; padding-bottom: 24px; color: #999999; font-size: 12px;">Este correo fue enviado de forma automática por el sistema, por lo que no es necesario responder. Si necesitas más información sobre cualquiera de nuestros servicios o tienes alguna duda, puedes abrir un hilo dentro de la plataforma.<br/><br/>Si el correo contiene algún código o enlace, este expirará en menos de 5 minutos después de haber sido recibido, con fines de seguridad.</p>
                  </td>
                </tr>
              </table>

            </td> 
          </tr>
          <tr>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `
  }
}

export const zoho = new Zoho(
  ZOHO.ACCOUNT_ID,
  ZOHO.CLIENT_ID,
  ZOHO.CLIENT_SECRET
)
