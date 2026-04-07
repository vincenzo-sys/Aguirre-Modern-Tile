import { NextResponse } from 'next/server'

export async function GET() {
  const env = {
    DATABASE_URI: process.env.DATABASE_URI ? `${process.env.DATABASE_URI.substring(0, 30)}...` : 'NOT SET',
    PAYLOAD_SECRET: process.env.PAYLOAD_SECRET ? 'SET' : 'NOT SET',
    NODE_ENV: process.env.NODE_ENV,
  }

  let payloadError = null
  try {
    const { getPayload } = await import('payload')
    const config = await import('@payload-config')
    await getPayload({ config: config.default })
  } catch (e: any) {
    payloadError = {
      message: e.message,
      stack: e.stack?.split('\n').slice(0, 5),
    }
  }

  return NextResponse.json({ env, payloadError })
}
