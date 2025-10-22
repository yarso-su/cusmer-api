import { S3Client } from 'bun'
import { R2 } from './constants'
import { ServiceError } from './errors'
import { logger } from '@/services/logger'

interface Config {
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
  endpoint: string
}

interface Type {
  ext: string
  mime: string
}

class R2Service {
  private client: S3Client

  constructor(config: Config) {
    this.client = new S3Client({
      bucket: config.bucketName,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      endpoint: config.endpoint,
      region: 'auto'
    })
  }

  getPresignedUrl(filename: string, type: Type) {
    try {
      return this.client.presign(filename, {
        method: 'PUT',
        expiresIn: 3600,
        type: type.mime,
        acl: 'public-read'
      })
    } catch (err: any) {
      throw new ServiceError('R2 Cloudflare', err)
    }
  }

  async dropAttachments(attachments: Array<string>) {
    for (const attachment of attachments) {
      try {
        await this.client.delete(attachment)
      } catch (err) {
        logger.internal('R2Service.dropAttachments', err)
      }
    }
  }

  async dropAttachment(filename: string) {
    try {
      await this.client.delete(filename)
    } catch (err: any) {
      throw new ServiceError('R2 Cloudflare', err)
    }
  }
}

export const r2 = new R2Service({
  accessKeyId: R2.ACCESS_KEY_ID,
  secretAccessKey: R2.SECRET_ACCESS_KEY,
  bucketName: R2.BUCKET_NAME,
  endpoint: R2.ENDPOINT
})
