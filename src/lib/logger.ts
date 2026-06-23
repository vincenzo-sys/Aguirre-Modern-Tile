// Client-side logging that stays quiet in production. Use this instead of bare
// console.error in client components — most failures already surface a toast to
// the user, so the console line is only useful while developing. Server-side
// API routes keep their own console.* logging (it lands in Vercel logs).

export function logError(message: string, err?: unknown): void {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.error(message, err)
  }
}
