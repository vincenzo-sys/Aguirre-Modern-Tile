import { describe, it, expect } from 'vitest'
import {
  checkSpam,
  normalizeEmail,
  looksLikeBotName,
  hasNoVowels,
  isStructurallyValidNanp,
  hasUnassignedAreaCode,
  textHasNoLetters,
  phoneDigits,
  SPAM_THRESHOLD,
} from './spamCheck'

// The two tables below are REAL rows out of quote_requests, not invented
// fixtures. The gate's whole value is that it separates these two lists, so
// the test asserts exactly that and nothing softer.

const REAL_CUSTOMERS = [
  { name: 'Tiffany',            phone: '(617) 849-3772', email: null,                     text: 'I have the tile I want to use' },
  { name: 'Holly Wang',         phone: '(857) 268-8638', email: 'hollywong721@gmail.com',  text: 'Hi, I would like to redo tiles (wall around bathtub) in a 5*7\'8\'\' bathroom in Cambridge.' },
  { name: 'Adam Powell',        phone: '(847) 703-0314', email: 'adamcpowell@gmail.com',   text: 'I need to remove a bathtub surrounded by granite tiles.' },
  // Deliberately included: his email has a typo'd TLD (.djcom). A real lead
  // worth thousands must not be quarantined for a typo.
  { name: 'JeffrJey Kushmerek', phone: '(617) 312-4979', email: 'jrkoosh@gmail.djcom',     text: 'Demo and replace existing shower in second floor bathroom 50 sqft approx in 1950\'s Cape home.' },
]

const KNOWN_BOTS = [
  { name: 'WTDfbHBtRIKBJUqCu',        phone: '6745081402', email: 'hsa.ma.n2.2@gmail.com',                 text: '6891598628' },
  { name: 'wpEKafWPBKPDKNwofIylvsR',  phone: '8420131949', email: 't.ad.ka.b.o.mbay@gmail.com',            text: '' },
  { name: 'xFTURhVBpfwxvYRiLDjB',     phone: '9149824439', email: 'n.ick...z.u.clic.h@gmail.com',          text: '' },
  { name: 'KFgGWunHxsIamtnN',         phone: '9187654856', email: 'gf.l.o.i.s.ell.e@gmail.com',            text: '' },
  { name: 'GzUvsnoexKEmGZbFHoOTtlDa', phone: '2158084473', email: 'jart9902@yahoo.com',                    text: '' },
  { name: 'YlrJpnbWJIFRkovbpkA',      phone: '4713601953', email: 'agrace@chs-adphila.org',                text: '' },
  { name: 'bDRGGZpkVUruoELdygvLSeKT', phone: '7343019262', email: 'fc.fcfd.b@gmail.com',                   text: '' },
  { name: 'sYQHxuXLRBwnjDWIaZWn',     phone: '2758671485', email: 'yolandabridges72@yahoo.com',            text: '' },
  { name: 'ooKCVRlMaxsKacFTdczM',     phone: '9861110908', email: 'billing%kdande.com@gtempaccount.com',   text: '' },
  { name: 'zTMCDHMYkZUeFNzRREsGYmp',  phone: '6169939000', email: 'e.w.e.w.aju.r.i8.11@gmail.com',         text: '' },
  { name: 'NFoMGzHHwtYOcLMAJGrAOc',   phone: '5539101347', email: 'k.utiwe.pi.se.q96.7@gmail.com',         text: '' },
  { name: 'wWUUCZZVZkNjDKJFPlTQCb',   phone: '9061323563', email: 'c.i.tuquyu.r.i6.2@gmail.com',           text: '' },
  { name: 'ZdcKyqzCAbBUbzdzgNKbvA',   phone: '4520248164', email: 'e.p.i.g.o.p.un.i.52@gmail.com',         text: '' },
  { name: 'PYKOSiUEQmuUYSZRgDlFRpgK', phone: '2693117834', email: 'ma.r.uridep.1.2@gmail.com',             text: '' },
  { name: 'LxIFuQrBBreMNpittm',       phone: '9852318187', email: 'e.bagup.az5.2.2@gmail.com',             text: '' },
]

describe('checkSpam — separation on real data', () => {
  it.each(REAL_CUSTOMERS)('lets $name through', (c) => {
    const v = checkSpam(c)
    expect(v.isSpam, `quarantined a real customer: ${v.reasons.join(', ')}`).toBe(false)
  })

  it.each(KNOWN_BOTS)('quarantines $name', (b) => {
    const v = checkSpam(b)
    expect(v.isSpam, `bot slipped through with score ${v.score}`).toBe(true)
  })

  it('catches every known bot and no real customer', () => {
    expect(KNOWN_BOTS.filter((b) => !checkSpam(b).isSpam)).toEqual([])
    expect(REAL_CUSTOMERS.filter((c) => checkSpam(c).isSpam)).toEqual([])
  })
})

describe('invisible signals', () => {
  const human = REAL_CUSTOMERS[1]

  it('quarantines on a filled honeypot alone', () => {
    expect(checkSpam({ ...human, honeypot: 'http://spam' }).isSpam).toBe(true)
  })

  it('ignores an empty honeypot', () => {
    expect(checkSpam({ ...human, honeypot: '' }).isSpam).toBe(false)
  })

  it('quarantines a sub-3-second submit', () => {
    expect(checkSpam({ ...human, elapsedMs: 400 }).isSpam).toBe(true)
  })

  it('lets a human-paced submit through', () => {
    expect(checkSpam({ ...human, elapsedMs: 45_000 }).isSpam).toBe(false)
  })

  // The Turnstile cases below are the ones that would have broken the form.
  // Setting TURNSTILE_SECRET_KEY makes every request without a token look
  // "unverified" — if that scored as a failure, switching Turnstile on would
  // have quarantined 100% of real customers the moment the key was added.
  it('treats an unconfigured Turnstile as no signal', () => {
    expect(checkSpam({ ...human, turnstile: 'not_configured' }).isSpam).toBe(false)
  })

  it('lets a passing Turnstile through', () => {
    expect(checkSpam({ ...human, turnstile: 'passed' }).isSpam).toBe(false)
  })

  it('does NOT quarantine a real customer whose token never arrived', () => {
    // Blocked script, corporate proxy, stale cached tab, Cloudflare outage.
    const v = checkSpam({ ...human, turnstile: 'missing' })
    expect(v.score).toBeLessThan(SPAM_THRESHOLD)
    expect(v.isSpam).toBe(false)
  })

  it('still catches a bot that omits the token, via its other signals', () => {
    expect(checkSpam({ ...KNOWN_BOTS[0], turnstile: 'missing' }).isSpam).toBe(true)
  })

  it('quarantines a token Cloudflare actively rejected', () => {
    expect(checkSpam({ ...human, turnstile: 'failed' }).isSpam).toBe(true)
  })
})

describe('no single soft signal can quarantine a real customer', () => {
  // The tuning promise: soft signals sit BELOW the threshold on their own, so
  // one odd-looking field never costs Vince a lead.
  it('an unassigned area code alone is not enough', () => {
    const v = checkSpam({ name: 'Holly Wang', phone: '6745081402', text: 'Tub surround please' })
    expect(v.score).toBeLessThan(SPAM_THRESHOLD)
    expect(v.isSpam).toBe(false)
  })

  it('a digits-only description alone is not enough', () => {
    const v = checkSpam({ name: 'Holly Wang', phone: '(857) 268-8638', text: '6891598628' })
    expect(v.isSpam).toBe(false)
  })

  it('gmail dots alone are not enough', () => {
    const v = checkSpam({ name: 'Holly Wang', phone: '(857) 268-8638', email: 'h.o.l.l.y.w@gmail.com' })
    expect(v.isSpam).toBe(false)
  })
})

describe('normalizeEmail', () => {
  it('collapses gmail dot obfuscation to one inbox', () => {
    expect(normalizeEmail('hsa.ma.n2.2@gmail.com')).toBe('hsaman22@gmail.com')
    expect(normalizeEmail('h.s.a.man22@gmail.com')).toBe('hsaman22@gmail.com')
  })
  it('strips +tags', () => {
    expect(normalizeEmail('vince+tile@gmail.com')).toBe('vince@gmail.com')
  })
  it('leaves non-gmail dots alone — they are significant elsewhere', () => {
    expect(normalizeEmail('First.Last@outlook.com')).toBe('first.last@outlook.com')
  })
  it('is case-insensitive', () => {
    expect(normalizeEmail('  HOLLY@Example.COM ')).toBe('holly@example.com')
  })
})

describe('phone helpers', () => {
  it('strips a leading country code', () => {
    expect(phoneDigits('+1 (617) 849-3772')).toBe('6178493772')
  })
  it('accepts real Boston numbers', () => {
    for (const p of ['(617) 849-3772', '857-268-8638', '(781) 555-0100', '978.555.0100']) {
      expect(isStructurallyValidNanp(p), p).toBe(true)
      expect(hasUnassignedAreaCode(p), p).toBe(false)
    }
  })
  it('rejects N11 area and exchange codes', () => {
    expect(isStructurallyValidNanp('9115550100')).toBe(false)
    expect(isStructurallyValidNanp('6174115555')).toBe(false)
  })
  it('rejects an area or exchange code starting 0 or 1', () => {
    expect(isStructurallyValidNanp('1235550100')).toBe(false)
    expect(isStructurallyValidNanp('6170555100')).toBe(false)
  })
  it('flags 674 — Nauru country code, never a NANP area code', () => {
    expect(isStructurallyValidNanp('6745081402')).toBe(true) // structurally fine…
    expect(hasUnassignedAreaCode('6745081402')).toBe(true)   // …but not a real area code
  })
})

describe('name heuristics', () => {
  it('flags the campaign signature', () => {
    expect(looksLikeBotName('WTDfbHBtRIKBJUqCu')).toBe(true)
    expect(looksLikeBotName('GzUvsnoexKEmGZbFHoOTtlDa')).toBe(true)
  })
  it('does not flag real names, including long or hyphenated ones', () => {
    for (const n of [
      'Tiffany', 'Holly Wang', 'Adam Powell', 'JeffrJey Kushmerek',
      'Christopher', 'Bartholomew', 'Maria-Antonietta Rossi',
      'Anne-Sophie Vandenbroucke', 'Konstantinos Papadopoulos',
      "O'Shaughnessy", 'van der Berg',
    ]) {
      expect(looksLikeBotName(n), n).toBe(false)
    }
  })
  it('flags vowel-less runs but not short initials', () => {
    expect(hasNoVowels('BCDFGHJK')).toBe(true)
    expect(hasNoVowels('TJ')).toBe(false)
  })
})

describe('textHasNoLetters', () => {
  it('flags a phone number pasted as a description', () => {
    expect(textHasNoLetters('6891598628')).toBe(true)
  })
  it('does not flag empty text — a blank field is not evidence', () => {
    expect(textHasNoLetters('')).toBe(false)
  })
  it('does not flag a real description containing digits', () => {
    expect(textHasNoLetters('50 sqft approx in a 1950s Cape')).toBe(false)
  })
})
