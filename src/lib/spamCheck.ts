// Intake spam gate for the public quote + contact forms.
//
// Context: in Aug 2026 a bot campaign put 15 fake leads into quote_requests
// (7 on Aug 13 alone) and ~110 junk rows into customers. Every one passed the
// existing validation, because that validation only asked "is this shaped like
// a phone number / does this have an @ in it" — questions a bot answers as
// easily as a person.
//
// DESIGN CONSTRAINT (Vince, explicitly): least possible friction for real
// customers. Two consequences run through this whole file:
//
//   1. Nothing here is a CAPTCHA the customer has to solve. Every signal is
//      either invisible (honeypot, timing, Turnstile) or derived from data
//      they already typed.
//   2. Failing the gate QUARANTINES, it never rejects. The lead row is always
//      written. A false positive costs Vince one click in the dashboard; a
//      false negative costs a stranger an unsolicited text. The scoring below
//      is tuned to be conservative in that direction — most single signals sit
//      BELOW the threshold on purpose, so one soft mismatch can't quarantine a
//      real customer on its own.

export const SPAM_THRESHOLD = 5

export interface SpamCheckInput {
  name?: string | null
  email?: string | null
  phone?: string | null
  /** Free-text the customer wrote — description, notes, additionalNotes. */
  text?: string | null
  /** Hidden field only a bot fills. Must be empty. */
  honeypot?: string | null
  /** Milliseconds between form render and submit, if the client reported it. */
  elapsedMs?: number | null
  /** Outcome of Cloudflare Turnstile verification. See TurnstileResult. */
  turnstile?: TurnstileResult | null
}

/**
 * Four outcomes, not a boolean, because "no token arrived" and "the token was
 * rejected" mean very different things and must not be scored the same.
 *
 *   not_configured — no secret key set. No signal at all.
 *   passed         — Cloudflare verified it. No signal.
 *   missing        — no token in the request. WEAK signal: this is also what a
 *                    real customer looks like on a stale cached page, behind a
 *                    corporate proxy that blocks Cloudflare's script, or with
 *                    an aggressive content blocker. Scored below the threshold
 *                    so it can never quarantine someone on its own.
 *   failed         — a token was supplied and Cloudflare rejected it. Nothing
 *                    legitimate produces this. Strong signal.
 */
export type TurnstileResult = 'not_configured' | 'passed' | 'missing' | 'failed'

export interface SpamVerdict {
  isSpam: boolean
  score: number
  reasons: string[]
}

// ── Email ───────────────────────────────────────────────────────────────────

/**
 * Canonical form of an address, for dedupe and rate limiting.
 *
 * Gmail ignores dots and everything after a `+`, so `hsa.ma.n2.2@gmail.com`
 * and `hsaman22@gmail.com` are the same inbox. The Aug campaign leaned on
 * exactly this to mint 15 "distinct" addresses from a couple of real ones —
 * normalizing collapses them back together so a rate limit can see it.
 */
export function normalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase()
  const at = trimmed.lastIndexOf('@')
  if (at <= 0) return trimmed
  let local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1)
  const plus = local.indexOf('+')
  if (plus > 0) local = local.slice(0, plus)
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.replace(/\./g, '')
  }
  return `${local}@${domain}`
}

// Deliberately NOT checking the TLD against a known list. A real customer this
// month submitted `jrkoosh@gmail.djcom` — an obvious typo, but a live lead
// worth thousands. Typos are a reason to call someone, not to quarantine them.

// ── Phone ───────────────────────────────────────────────────────────────────

// Assigned NANP area codes (US, Canada, and the Caribbean members). Used as a
// SIGNAL, not a hard block — the plan adds codes over time and a stale list
// must never be able to reject a real customer on its own. Scored below the
// threshold accordingly.
const NANP_AREA_CODES = new Set([
  // US — by state, roughly
  '205','251','256','334','659','938','907','480','520','602','623','928','327','479','501','870',
  '209','213','279','310','323','341','350','369','408','415','424','442','510','530','559','562',
  '619','626','628','650','657','661','669','707','714','747','760','764','805','818','820','831',
  '840','858','859','909','916','925','949','951','303','719','720','970','983','203','475','860',
  '959','302','202','239','305','321','324','352','386','407','448','561','645','656','689','727',
  '728','754','772','786','813','850','863','904','941','954','229','404','470','478','678','706',
  '762','770','912','943','808','208','986','217','224','309','312','331','447','464','618','630',
  '708','730','773','779','815','847','872','219','260','317','463','574','765','812','930','319',
  '515','563','641','712','316','620','785','913','270','364','502','606','859','225','318','337',
  '504','985','207','227','240','301','410','443','667','339','351','413','508','617','774','781',
  '857','978','231','248','269','313','517','586','616','679','734','810','906','947','989','218',
  '320','507','612','651','763','952','228','601','662','769','314','417','557','573','636','660',
  '816','975','406','308','402','531','702','725','775','603','201','551','609','640','732','848',
  '856','862','908','973','505','575','212','315','329','332','347','363','516','518','585','607',
  '631','646','680','716','718','838','845','914','917','929','934','252','336','704','743','828',
  '910','919','980','984','701','216','220','234','283','326','330','380','419','440','513','567',
  '614','740','937','405','539','580','918','458','503','541','971','215','223','267','272','412',
  '445','484','570','582','610','717','724','814','835','878','401','803','839','843','854','864',
  '605','423','615','629','731','865','901','931','210','214','254','281','325','346','361','409',
  '430','432','469','512','682','713','726','737','806','817','830','832','903','915','936','940',
  '945','956','972','979','385','435','801','802','276','434','540','571','686','703','757','804',
  '826','948','206','253','360','425','509','564','304','681','262','274','414','534','608','715',
  '920','307',
  // US territories
  '340','670','671','787','939',
  // Canada
  '204','226','236','249','250','263','289','306','343','354','365','367','368','382','403','416',
  '418','428','431','437','438','450','468','474','506','514','519','548','579','581','584','587',
  '600','604','613','639','647','672','683','705','709','742','753','778','780','782','807','819',
  '825','867','873','879','902','905',
  // Caribbean / Atlantic NANP members
  '242','246','264','268','284','345','441','473','649','658','664','721','758','767','768','784',
  '809','829','849','868','869','876','658',
  // Non-geographic
  '800','833','844','855','866','877','888','822','880','881','882','883','884','885','886','887','889',
])

/** Digits only, dropping a leading US country code. */
export function phoneDigits(phone: string): string {
  const d = phone.replace(/\D/g, '')
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d
}

/**
 * Structural NANP validity: 10 digits, area and exchange codes both starting
 * 2-9, and no N11 service code in the area slot. These rules are fixed by the
 * numbering plan itself, so unlike the list above they can't go stale.
 */
export function isStructurallyValidNanp(phone: string): boolean {
  const d = phoneDigits(phone)
  if (d.length !== 10) return false
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(d)) return false
  if (d.slice(1, 3) === '11') return false // N11 service code in the area slot (211, 411, 911, …)
  if (d.slice(4, 6) === '11') return false // N11 in the exchange slot
  return true
}

/** True when the area code isn't one the numbering plan has handed out. */
export function hasUnassignedAreaCode(phone: string): boolean {
  const d = phoneDigits(phone)
  if (d.length !== 10) return false
  return !NANP_AREA_CODES.has(d.slice(0, 3))
}

// ── Name ────────────────────────────────────────────────────────────────────

/**
 * The Aug campaign's signature: one alphabetic token, 15+ characters, mixing
 * upper and lower case, no space — `WTDfbHBtRIKBJUqCu`, `xFTURhVBpfwxvYRiLDjB`.
 *
 * Verified against the live table: this matches all 15 known bot leads and
 * none of the real customers. Long real names are either hyphenated, spaced,
 * or not randomly capitalised mid-word.
 */
export function looksLikeBotName(name: string): boolean {
  const n = name.trim()
  if (n.length < 15) return false
  if (/[\s'.-]/.test(n)) return false
  if (!/^[A-Za-z]+$/.test(n)) return false
  return /[a-z]/.test(n) && /[A-Z]/.test(n)
}

/** A long run with no vowel at all is machine-generated, not a name. */
export function hasNoVowels(name: string): boolean {
  const n = name.trim()
  return n.length >= 6 && /^[A-Za-z]+$/.test(n) && !/[aeiouyAEIOUY]/.test(n)
}

// ── Free text ───────────────────────────────────────────────────────────────

/** A "description" of `6891598628` is not a description. */
export function textHasNoLetters(text: string): boolean {
  const t = text.trim()
  return t.length > 0 && !/[a-zA-Z]/.test(t)
}

const LINK_RE = /(https?:\/\/|www\.|\[url|<a\s)/i

// ── Verdict ─────────────────────────────────────────────────────────────────

export function checkSpam(input: SpamCheckInput): SpamVerdict {
  const reasons: string[] = []
  let score = 0
  const add = (points: number, reason: string) => {
    score += points
    reasons.push(reason)
  }

  const name = (input.name ?? '').trim()
  const email = (input.email ?? '').trim()
  const phone = (input.phone ?? '').trim()
  const text = (input.text ?? '').trim()

  // ── Invisible checks. Zero friction, and a real browser driven by a real
  // person cannot trip them.
  if ((input.honeypot ?? '').trim().length > 0) {
    add(10, 'honeypot_filled')
  }
  if (typeof input.elapsedMs === 'number' && input.elapsedMs >= 0 && input.elapsedMs < 3000) {
    add(5, `submitted_in_${Math.round(input.elapsedMs)}ms`)
  }
  if (input.turnstile === 'failed') {
    add(10, 'turnstile_failed')
  } else if (input.turnstile === 'missing') {
    // Deliberately 3, not 10. A bot that simply omits the token still needs
    // other signals to cross the threshold, while a real customer whose
    // browser never loaded the widget sails through.
    add(3, 'turnstile_token_missing')
  }

  // ── Content signals.
  if (name && looksLikeBotName(name)) add(5, 'name_is_random_token')
  else if (name && hasNoVowels(name)) add(3, 'name_has_no_vowels')

  if (phone) {
    if (!isStructurallyValidNanp(phone)) add(3, 'phone_not_valid_nanp')
    else if (hasUnassignedAreaCode(phone)) add(3, `unassigned_area_code_${phoneDigits(phone).slice(0, 3)}`)
  }

  if (text) {
    if (textHasNoLetters(text)) add(3, 'description_has_no_letters')
    if (LINK_RE.test(text)) add(4, 'description_contains_link')
  }

  if (email) {
    const local = email.slice(0, email.lastIndexOf('@'))
    const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase()
    const dots = (local.match(/\./g) || []).length
    if ((domain === 'gmail.com' || domain === 'googlemail.com') && dots >= 4) {
      add(2, `gmail_dot_obfuscation_${dots}`)
    }
  }

  return { isSpam: score >= SPAM_THRESHOLD, score, reasons }
}

// ── Turnstile ───────────────────────────────────────────────────────────────

/**
 * Verify a Cloudflare Turnstile token.
 *
 * Every failure mode that isn't "Cloudflare actively rejected this token"
 * degrades to a weak or absent signal. Turning Turnstile on must never be able
 * to lock real customers out of the form — the widget failing to load, an
 * outage at Cloudflare, or a stale page in someone's tab are all outcomes
 * where the rest of the gate should decide, not this one check.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp?: string | null
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return 'not_configured'
  if (!token || typeof token !== 'string') return 'missing'
  try {
    const body = new URLSearchParams({ secret, response: token })
    if (remoteIp) body.set('remoteip', remoteIp)
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5000),
    })
    const json = (await res.json()) as { success?: boolean }
    return json.success === true ? 'passed' : 'failed'
  } catch {
    // Cloudflare unreachable or slow. Not the customer's fault — no signal.
    return 'not_configured'
  }
}
