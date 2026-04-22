// Discord webhook helper for daily ops notifications.
// Set DISCORD_OPS_WEBHOOK in Vercel env. If unset, calls are no-ops so the
// cron doesn't fail in local dev or when the webhook isn't configured yet.

export interface DiscordEmbed {
  title: string
  description?: string
  color?: number
  fields?: Array<{ name: string; value: string; inline?: boolean }>
  footer?: { text: string }
  timestamp?: string
}

export async function postToDiscord(options: {
  content?: string
  embeds?: DiscordEmbed[]
  username?: string
}): Promise<{ ok: boolean; error?: string }> {
  const webhook = process.env.DISCORD_OPS_WEBHOOK
  if (!webhook) {
    return { ok: false, error: 'DISCORD_OPS_WEBHOOK not set' }
  }

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: options.content,
        embeds: options.embeds,
        username: options.username ?? 'Aguirre Ops',
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      return { ok: false, error: `Discord ${res.status}: ${text.slice(0, 200)}` }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export const DISCORD_COLORS = {
  green: 0x22c55e,
  amber: 0xf59e0b,
  red: 0xef4444,
  blue: 0x3b82f6,
  gray: 0x6b7280,
} as const
