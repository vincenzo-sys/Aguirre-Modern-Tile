// Thin helper around OpenPhone's transcript API. Called from both the
// webhook (real-time, via call.transcript.completed event) and the
// catch-up cron (polls every 30 min for calls missing transcripts).

const OPENPHONE_API_BASE = 'https://api.openphone.com/v1'

export interface TranscriptSegment {
  speaker?: string
  text: string
  start?: number
  end?: number
}

export interface OpenPhoneTranscript {
  callId: string
  segments: TranscriptSegment[]
  text: string // flattened "Speaker: line\nSpeaker: line" for easy storage
  duration?: number
  createdAt?: string
}

export async function fetchOpenPhoneTranscript(
  openphoneCallId: string
): Promise<OpenPhoneTranscript | null> {
  const apiKey = process.env.OPENPHONE_API_KEY
  if (!apiKey) return null

  const res = await fetch(`${OPENPHONE_API_BASE}/call-transcripts/${openphoneCallId}`, {
    headers: { Authorization: apiKey },
  })

  if (res.status === 404) return null
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenPhone transcript ${res.status}: ${body.slice(0, 200)}`)
  }

  const payload = await res.json()
  // OpenPhone wraps payloads in `data`; be defensive for both shapes.
  const t = payload.data ?? payload
  const rawSegments: unknown[] = Array.isArray(t.dialogue)
    ? t.dialogue
    : Array.isArray(t.segments)
      ? t.segments
      : []

  const segments: TranscriptSegment[] = rawSegments
    .map((seg) => {
      const s = seg as Record<string, unknown>
      return {
        speaker: typeof s.identifier === 'string' ? s.identifier : typeof s.speaker === 'string' ? s.speaker : undefined,
        text: typeof s.content === 'string' ? s.content : typeof s.text === 'string' ? s.text : '',
        start: typeof s.start === 'number' ? s.start : undefined,
        end: typeof s.end === 'number' ? s.end : undefined,
      }
    })
    .filter((s) => s.text.trim().length > 0)

  const text = segments
    .map((s) => (s.speaker ? `${s.speaker}: ${s.text}` : s.text))
    .join('\n')

  return {
    callId: openphoneCallId,
    segments,
    text,
    duration: typeof t.duration === 'number' ? t.duration : undefined,
    createdAt: typeof t.createdAt === 'string' ? t.createdAt : undefined,
  }
}
