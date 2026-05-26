import { createHmac, timingSafeEqual } from 'node:crypto'

export class HmacError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HmacError'
  }
}

export interface VerifyArgs {
  headers: Headers
  method: string
  path: string
  body?: string
}

export function verifyMiddlegroundHmac({ headers, method, path, body = '' }: VerifyArgs): void {
  const secret = process.env.MIDDLEGROUND_HMAC_SECRET
  if (!secret) {
    throw new HmacError('E_AUTH_FAILED: server missing MIDDLEGROUND_HMAC_SECRET')
  }

  const timestamp = headers.get('x-middleground-timestamp')
  const signature = headers.get('x-middleground-signature')

  if (!timestamp || !signature) {
    throw new HmacError('E_AUTH_FAILED: missing headers')
  }

  const ts = parseInt(timestamp, 10)
  if (!Number.isFinite(ts)) {
    throw new HmacError('E_AUTH_FAILED: invalid timestamp')
  }

  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - ts) > 300) {
    throw new HmacError('E_AUTH_FAILED: timestamp out of window')
  }

  const signingString = `${timestamp}\n${method.toUpperCase()}\n${path}\n${body}`
  const expected = createHmac('sha256', secret).update(signingString).digest('hex')

  const received = signature.replace(/^sha256=/, '')
  if (received.length !== expected.length) {
    throw new HmacError('E_AUTH_FAILED: length mismatch')
  }

  let receivedBuf: Buffer
  let expectedBuf: Buffer
  try {
    receivedBuf = Buffer.from(received, 'hex')
    expectedBuf = Buffer.from(expected, 'hex')
  } catch {
    throw new HmacError('E_AUTH_FAILED: signature not hex')
  }

  if (receivedBuf.length !== expectedBuf.length || !timingSafeEqual(receivedBuf, expectedBuf)) {
    throw new HmacError('E_AUTH_FAILED: signature mismatch')
  }
}
