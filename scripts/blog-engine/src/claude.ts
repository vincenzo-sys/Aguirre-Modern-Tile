import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { env, CLAUDE_MODEL, MAX_TOKENS, DOMAIN, REVISION_THRESHOLDS, HARD_FLOOR_SCORE } from './config.js'
import { scoreArticle } from './seo-scorer.js'
import type { SeoScore } from './seo-scorer.js'
import { buildAnalyzePrompt } from './prompts/analyze.js'
import { buildWritePrompt, getWritingRulesBlock } from './prompts/write.js'
import { buildEditPrompt } from './prompts/edit.js'
import type { QueueItem } from './queue.js'
import type { ScrapedArticle } from './scraper.js'
import type { TileServiceData } from './tile-data.js'
import type { PublishedPost } from './payload.js'

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

interface CompetitorBenchmarks {
  avgWordCount: number
  avgH2Count: number
  avgListCount: number
  avgTableCount: number
  avgLinkCount: number
}

interface AnalysisResult {
  commonTopics: string[]
  gaps: string[]
  topicGaps?: string[]
  depthGaps?: string[]
  dataGaps?: string[]
  entityGaps?: string[]
  entityFrequency?: { entity: string; mentions: number }[]
  structuralPatterns?: string[]
  contentFormats?: string[]
  recommendedH2s: string[]
  faqQuestions: string[]
  estimatedWordCount: number
  suggestedTags: string[]
  competitorBenchmarks?: CompetitorBenchmarks
}

interface WriteResult {
  title: string
  html: string
  excerpt: string
  metaTitle: string
  metaDescription: string
  earlyCta?: string
  closingCta?: string
  faqItems: { question: string; answer: string }[]
  suggestedCategory: string
}

interface EditResult {
  html: string
  changes: string[]
  qualityScore: number
}

const CompetitorBenchmarksSchema = z.object({
  avgWordCount: z.number(),
  avgH2Count: z.number(),
  avgListCount: z.number(),
  avgTableCount: z.number(),
  avgLinkCount: z.number(),
}).optional()

const AnalysisResultSchema = z.object({
  commonTopics: z.array(z.string()),
  gaps: z.array(z.string()),
  topicGaps: z.array(z.string()).optional(),
  depthGaps: z.array(z.string()).optional(),
  dataGaps: z.array(z.string()).optional(),
  entityGaps: z.array(z.string()).optional(),
  entityFrequency: z.array(z.object({ entity: z.string(), mentions: z.number() })).optional(),
  structuralPatterns: z.array(z.string()).optional(),
  contentFormats: z.array(z.string()).optional(),
  recommendedH2s: z.array(z.string()),
  faqQuestions: z.array(z.string()),
  estimatedWordCount: z.number(),
  suggestedTags: z.array(z.string()),
  competitorBenchmarks: CompetitorBenchmarksSchema,
})

function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 3).replace(/\s\S*$/, '...')
}

const WriteResultSchema = z.object({
  title: z.string().transform(s => truncateAtWord(s, 80)),
  html: z.string(),
  excerpt: z.string(),
  metaTitle: z.string().transform(s => truncateAtWord(s, 60)),
  metaDescription: z.string().transform(s => truncateAtWord(s, 160)),
  earlyCta: z.string().optional(),
  closingCta: z.string().optional(),
  faqItems: z.array(z.object({ question: z.string(), answer: z.string() })),
  suggestedCategory: z.string(),
})

const EditResultSchema = z.object({
  html: z.string(),
  changes: z.array(z.string()),
  qualityScore: z.number(),
})

function extractJsonString(text: string): string {
  let jsonStr = text.trim()

  // Remove markdown code fences if present (greedy to handle large JSON)
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*)```\s*$/)
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim()
  }

  // Also try: find the first { and last } to extract JSON object
  if (!jsonStr.startsWith('{') && !jsonStr.startsWith('[')) {
    const start = jsonStr.indexOf('{')
    const end = jsonStr.lastIndexOf('}')
    if (start !== -1 && end !== -1 && end > start) {
      jsonStr = jsonStr.slice(start, end + 1)
    }
  }

  return jsonStr
}

/**
 * Walk through a JSON string and escape unescaped double quotes inside string values.
 *
 * Works by scanning character-by-character. When we're inside a JSON string value
 * (after `"key": "`), we check each `"` to see if it's a structural boundary
 * (followed by `,` `}` `]` `:` or end-of-string) or a literal quote that needs escaping.
 */
function repairUnescapedQuotes(json: string): string {
  const chars = json.split('')
  let inString = false
  let isValueString = false
  let i = 0

  // Track whether the last key-colon pair means the next string is a value
  let afterColon = false

  while (i < chars.length) {
    const ch = chars[i]

    if (!inString) {
      if (ch === '"') {
        inString = true
        isValueString = afterColon
        afterColon = false
      } else if (ch === ':') {
        afterColon = true
      } else if (ch === ',' || ch === '{' || ch === '[') {
        afterColon = false
      }
      i++
      continue
    }

    // We're inside a string
    if (ch === '\\') {
      i += 2 // skip escaped char
      continue
    }

    if (ch === '"') {
      // Is this the closing quote of the string?
      const rest = json.slice(i + 1, i + 60).trimStart()
      const isStructural =
        rest.length === 0 ||
        rest[0] === ',' ||
        rest[0] === '}' ||
        rest[0] === ']' ||
        rest[0] === ':'

      if (isStructural) {
        // This is a real closing quote
        inString = false
        i++
        continue
      }

      // This is an unescaped quote inside a value — escape it
      if (isValueString) {
        chars.splice(i, 0, '\\')
        i += 2
        // Rebuild json from chars for future slice() calls
        json = chars.join('')
        continue
      }

      // Inside a key string — unlikely to have unescaped quotes but handle gracefully
      inString = false
      i++
      continue
    }

    i++
  }

  return chars.join('')
}

function parseJsonResponse<T>(text: string, schema: z.ZodType<T>): T {
  const jsonStr = extractJsonString(text)
  if (!jsonStr || jsonStr.length < 10) {
    console.log(`  [JSON Debug] extractJsonString returned near-empty result (${jsonStr.length} chars)`)
    console.log(`  [JSON Debug] Raw response starts with: ${text.slice(0, 200)}`)
    console.log(`  [JSON Debug] Raw response ends with: ...${text.slice(-200)}`)
  }
  try {
    const raw = JSON.parse(jsonStr)
    return schema.parse(raw)
  } catch (firstErr) {
    // Repair step 1: Replace literal control characters (U+0000–U+001F) ONLY inside JSON string values.
    // Structural whitespace (newlines/tabs between keys) must be preserved.
    let repaired = ''
    let inStr = false
    for (let j = 0; j < jsonStr.length; j++) {
      const c = jsonStr[j]
      if (inStr) {
        if (c === '\\') {
          repaired += c + (jsonStr[j + 1] || '')
          j++
          continue
        }
        if (c === '"') {
          inStr = false
          repaired += c
          continue
        }
        const code = c.charCodeAt(0)
        if (code < 0x20) {
          if (c === '\n') repaired += '\\n'
          else if (c === '\r') repaired += '\\r'
          else if (c === '\t') repaired += '\\t'
          // else strip other control chars
          continue
        }
        repaired += c
      } else {
        if (c === '"') inStr = true
        repaired += c
      }
    }

    // Repair step 2: Fix unescaped double quotes inside ALL JSON string values.
    // Claude often outputs HTML with literal "quotes" inside JSON strings.
    // Strategy: walk through the JSON, find each `"key": "value"` pair,
    // and escape any unescaped quotes inside the value that aren't structural boundaries.
    repaired = repairUnescapedQuotes(repaired)

    try {
      const raw = JSON.parse(repaired)
      return schema.parse(raw)
    } catch (repairErr) {
      // Log context around the error position for debugging (use repaired string)
      const errMsg = (repairErr as Error).message
      const errMatch = errMsg.match(/position (\d+)/)
      if (errMatch) {
        const errPos = parseInt(errMatch[1])
        console.log(`  [JSON Debug] Repair failed at position ${errPos}:`)
        console.log(`  ...${repaired.slice(Math.max(0, errPos - 80), errPos)}<<<HERE>>>${repaired.slice(errPos, errPos + 80)}...`)
      }
      throw repairErr
    }
  }
}

type SystemMessage = string | Anthropic.MessageCreateParams['system']

const RETRY_DELAYS = [2000, 4000, 8000]

// Sonnet 4.6 pricing (per million tokens)
const PRICING = {
  input: 3.0,
  output: 15.0,
  cacheWrite: 3.75,
  cacheRead: 0.30,
}

export interface TokenUsage {
  step: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  cost: number
}

// Accumulated token usage for the current article generation
let _articleTokenUsage: TokenUsage[] = []

export function resetTokenTracking(): void {
  _articleTokenUsage = []
}

export function getTokenUsage(): TokenUsage[] {
  return [..._articleTokenUsage]
}

export function getTokenSummary(): { totalInput: number; totalOutput: number; totalCacheRead: number; totalCacheWrite: number; totalCost: number; steps: TokenUsage[] } {
  const steps = getTokenUsage()
  const totalInput = steps.reduce((s, u) => s + u.inputTokens, 0)
  const totalOutput = steps.reduce((s, u) => s + u.outputTokens, 0)
  const totalCacheRead = steps.reduce((s, u) => s + u.cacheReadTokens, 0)
  const totalCacheWrite = steps.reduce((s, u) => s + u.cacheWriteTokens, 0)
  const totalCost = steps.reduce((s, u) => s + u.cost, 0)
  return { totalInput, totalOutput, totalCacheRead, totalCacheWrite, totalCost, steps }
}

function calculateCost(input: number, output: number, cacheRead: number, cacheWrite: number): number {
  return (
    (input * PRICING.input / 1_000_000) +
    (output * PRICING.output / 1_000_000) +
    (cacheRead * PRICING.cacheRead / 1_000_000) +
    (cacheWrite * PRICING.cacheWrite / 1_000_000)
  )
}

let _currentStep = 'unknown'

export function setCurrentStep(step: string): void {
  _currentStep = step
}

/**
 * Track token usage from an external API call (e.g., infographics).
 * Allows code that calls the Anthropic API directly to still log costs.
 */
export function trackUsage(step: string, usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }): void {
  const input = usage.input_tokens
  const output = usage.output_tokens
  const cacheRead = usage.cache_read_input_tokens ?? 0
  const cacheWrite = usage.cache_creation_input_tokens ?? 0
  const cost = calculateCost(input, output, cacheRead, cacheWrite)
  _articleTokenUsage.push({
    step,
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    cost,
  })
  console.log(`  💰 ${step}: $${cost.toFixed(4)} (${input.toLocaleString()} in / ${output.toLocaleString()} out)`)
}

async function callClaude(prompt: string, system?: SystemMessage): Promise<string> {
  let lastError: Error | null = null

  // Convert string system to content blocks format for caching support
  const systemParam = typeof system === 'string'
    ? [{ type: 'text' as const, text: system }]
    : system

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const response = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        ...(systemParam ? { system: systemParam } : {}),
        messages: [{ role: 'user', content: prompt }],
      })

      // Track token usage
      const usage = response.usage as unknown as Record<string, number>
      const inputTokens = (usage.input_tokens as number) || 0
      const outputTokens = (usage.output_tokens as number) || 0
      const cacheReadTokens = (usage.cache_read_input_tokens as number) || 0
      const cacheWriteTokens = (usage.cache_creation_input_tokens as number) || 0
      const cost = calculateCost(inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens)

      _articleTokenUsage.push({
        step: _currentStep,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        cost,
      })

      console.log(`    Tokens: ${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out | Cost: $${cost.toFixed(4)}`)
      if (cacheReadTokens || cacheWriteTokens) {
        console.log(`    Cache: ${cacheReadTokens.toLocaleString()} read, ${cacheWriteTokens.toLocaleString()} created`)
      }

      if (response.stop_reason === 'max_tokens') {
        console.warn(`  ⚠ Response truncated (hit max_tokens limit of ${MAX_TOKENS})`)
      }

      const textBlock = response.content.find((b) => b.type === 'text')
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text response from Claude')
      }

      return textBlock.text
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err))
      const status = (err as { status?: number }).status
      const isRetryable = status === 429 || status === 500 || status === 503 || status === 529

      if (!isRetryable || attempt >= RETRY_DELAYS.length) throw lastError

      const delay = RETRY_DELAYS[attempt]
      console.warn(`  ⚠ Claude API error (${status}), retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${RETRY_DELAYS.length})`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError!
}

function validateCta(field: string, cta: string | undefined, serviceType: string, keyword?: string): string[] {
  const issues: string[] = []

  if (!cta) {
    const msg = `${field}: Missing CTA — not provided in response`
    console.warn(`  ⚠ ${msg}`)
    issues.push(msg)
    return issues
  }

  const lower = cta.toLowerCase()
  const serviceTypeLower = serviceType.toLowerCase()

  // Check for specificity — must contain service type, a price reference, a room type, or a tile type
  const hasServiceType = lower.includes(serviceTypeLower)
  const hasPriceRef = /\$\d+|under \$|starting at|save \d|save up to|per sq/i.test(cta)
  const hasRoomType = /bathroom|shower|kitchen|floor|backsplash|laundry|entryway/i.test(cta)
  const hasTileType = /porcelain|ceramic|marble|natural stone|mosaic|subway|glass|slate/i.test(cta)
  const hasSpecificDetail = hasServiceType || hasPriceRef || hasRoomType || hasTileType

  if (!hasSpecificDetail) {
    const msg = `${field}: Generic CTA detected — "${cta.slice(0, 80)}" (needs service type, price, room type, or tile type)`
    console.warn(`  ⚠ ${msg}`)
    issues.push(msg)
  }

  // Check keyword relevance
  if (keyword) {
    const kwWords = keyword.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    const hasKeywordTerm = kwWords.some(w => lower.includes(w))
    if (!hasKeywordTerm) {
      const msg = `${field}: CTA doesn't reference article topic — "${cta.slice(0, 60)}" (missing keyword terms: ${kwWords.join(', ')})`
      console.warn(`  ⚠ ${msg}`)
      issues.push(msg)
    }
  }

  return issues
}

export async function analyzeCompetitors(
  keyword: string,
  competitors: ScrapedArticle[]
): Promise<AnalysisResult> {
  console.log('  Step 1/3: Analyzing competitors...')
  setCurrentStep('analyze')
  const prompt = buildAnalyzePrompt(keyword, competitors)
  const response = await callClaude(prompt, `You are an SEO content analyst for a tile installation company website (${DOMAIN}). Today's date is ${new Date().toISOString().split('T')[0]}. Respond with ONLY valid JSON.`)
  const result = parseJsonResponse(response, AnalysisResultSchema)
  console.log(`  ✓ Analysis complete — ${result.recommendedH2s.length} headings, ${result.faqQuestions.length} FAQs`)
  return result
}

export async function writeArticle(
  item: QueueItem,
  analysis: AnalysisResult,
  tileData?: TileServiceData,
  publishedPosts?: PublishedPost[],
  clusterArticles?: { slug: string; title: string; articleType: string; keyword?: string; headings: { level: number; text: string }[]; excerpt: string }[]
): Promise<WriteResult> {
  console.log('  Step 2/3: Writing article...')
  setCurrentStep('write')
  const prompt = buildWritePrompt(item, analysis, publishedPosts, clusterArticles)

  // Multi-block system prompt for caching:
  // Block 1: Role (tiny, always cached)
  // Block 2: Writing rules (static, cached across articles in cluster)
  // Block 3: Tile service data (static per service type, cached across articles)
  // Block 4: External links (static per service+type, cached across articles)
  const systemBlocks: Anthropic.MessageCreateParams['system'] = [
    {
      type: 'text' as const,
      text: `You are a professional home improvement and tile installation content writer for ${DOMAIN}. Today's date is ${new Date().toISOString().split('T')[0]}. Respond with ONLY valid JSON.`,
      cache_control: { type: 'ephemeral' as const },
    },
    {
      type: 'text' as const,
      text: getWritingRulesBlock(),
      cache_control: { type: 'ephemeral' as const },
    },
  ]

  const response = await callClaude(prompt, systemBlocks)
  const result = parseJsonResponse(response, WriteResultSchema)

  console.log(`  ✓ Article written — ${result.html.length} chars, ${result.faqItems.length} FAQs`)
  return result
}

export async function editArticle(
  html: string,
  keyword: string,
  articleType: string,
  articleStyle?: string,
  publishedPosts?: PublishedPost[],
  failedChecks?: string[],
  analysis?: { recommendedH2s: string[]; gaps: string[]; commonTopics: string[]; competitorBenchmarks?: { avgWordCount: number; avgH2Count: number; avgListCount: number; avgTableCount: number; avgLinkCount: number } },
): Promise<EditResult> {
  console.log(failedChecks ? '  Step 3b/3: Re-editing with failed checks...' : '  Step 3/3: Editing & QA...')
  setCurrentStep(failedChecks ? 'revision' : 'edit')
  const prompt = buildEditPrompt(html, keyword, articleType, articleStyle as 'standard' | 'narrative' | 'listicle' | 'data-heavy' | 'comparison' | 'how-to' | undefined, publishedPosts, failedChecks, analysis)
  const systemBlocks: Anthropic.MessageCreateParams['system'] = [
    {
      type: 'text' as const,
      text: `You are a senior editor reviewing a tile installation blog article for ${DOMAIN}. Today's date is ${new Date().toISOString().split('T')[0]}. Respond with ONLY valid JSON.`,
      cache_control: { type: 'ephemeral' as const },
    },
  ]
  const response = await callClaude(prompt, systemBlocks)
  const result = parseJsonResponse(response, EditResultSchema)
  console.log(`  ✓ Edit complete — ${result.changes.length} changes, quality: ${result.qualityScore}/100`)
  return result
}

export async function generateArticle(
  item: QueueItem,
  competitors: ScrapedArticle[],
  onStep?: (step: string, data: { elapsed: number; result: Record<string, unknown> }) => void,
  tileData?: TileServiceData,
  publishedPosts?: PublishedPost[]
): Promise<{
  title: string
  html: string
  excerpt: string
  metaTitle: string
  metaDescription: string
  faqItems: { question: string; answer: string }[]
  suggestedCategory: string
  suggestedTags: string[]
  qualityScore: number
  revision?: {
    triggered: boolean
    scoreBefore: number
    scoreAfter: number
    failedChecks: string[]
  }
  suggestedStatus: 'draft' | 'review'
  seoScore: ReturnType<typeof scoreArticle>
  editSkipped: boolean
}> {
  // Step 1: Analyze competitors
  const analyzeStart = Date.now()
  const analysis = await analyzeCompetitors(item.keyword, competitors)
  onStep?.('analyze', { elapsed: Date.now() - analyzeStart, result: analysis as unknown as Record<string, unknown> })

  // Step 2: Write article
  const writeStart = Date.now()
  // Fetch cluster context for cross-article awareness
  let clusterArticles: { slug: string; title: string; articleType: string; keyword?: string; headings: { level: number; text: string }[]; excerpt: string }[] = []
  if (publishedPosts && publishedPosts.length > 0) {
    try {
      const { getClusterContext } = await import('./payload.js')
      clusterArticles = await getClusterContext(item)
      if (clusterArticles.length > 0) {
        console.log(`  ✓ Cluster context: ${clusterArticles.length} sibling articles loaded`)
      }
    } catch { /* cluster context is optional */ }
  }

  const writeResult = await writeArticle(item, analysis, tileData, publishedPosts, clusterArticles)
  onStep?.('write', { elapsed: Date.now() - writeStart, result: writeResult as unknown as Record<string, unknown> })

  // Build analysis context for the editor (used only if edit is needed)
  const analysisContext = {
    recommendedH2s: analysis.recommendedH2s,
    gaps: analysis.gaps,
    commonTopics: analysis.commonTopics,
    competitorBenchmarks: analysis.competitorBenchmarks,
  }

  // Validate CTAs and collect issues
  const ctaIssues = [
    ...validateCta('earlyCta', writeResult.earlyCta, item.serviceType, item.keyword),
    ...validateCta('closingCta', writeResult.closingCta, item.serviceType, item.keyword),
  ]
  if (writeResult.earlyCta && writeResult.closingCta && writeResult.earlyCta === writeResult.closingCta) {
    const msg = 'CTAs: Early and closing CTAs are identical — they should be different'
    console.warn(`  ⚠ ${msg}`)
    ctaIssues.push(msg)
  }

  // Step 3: Score the raw write output BEFORE editing
  const targetWords = item.targetWords || (item.articleType === 'hub' ? 2500 : item.articleType === 'pillar' ? 1500 : 1000)
  const scorerBase = {
    keyword: item.keyword,
    slug: item.slug,
    metaTitle: writeResult.metaTitle,
    metaDescription: writeResult.metaDescription,
    excerpt: writeResult.excerpt,
    faqItems: writeResult.faqItems,
    articleType: item.articleType as 'hub' | 'pillar' | 'spoke',
    articleStyle: item.articleStyle,
    targetWords,
    hasImage: false,
    imageAlt: null,
    serviceType: item.serviceType,
    parentSlug: item.parentSlug,
    hubSlug: item.hubSlug,
    earlyCta: writeResult.earlyCta,
    closingCta: writeResult.closingCta,
  }

  const writeScore = scoreArticle({ html: writeResult.html, ...scorerBase })
  console.log(`  ✓ Write SEO score: ${writeScore.total}/${writeScore.maxTotal} (${writeScore.grade})`)

  // Collect failed checks
  const failedChecks: string[] = [
    ...ctaIssues,
    ...writeScore.categories.flatMap(cat =>
      cat.checks.filter(c => !c.passed).map(c => `[${cat.name}] ${c.name}: ${c.detail}`)
    ),
  ]

  // Type-aware threshold — only edit if score is below threshold
  const revisionThreshold = REVISION_THRESHOLDS[item.articleType] || 85
  let currentScore = writeScore
  let editResult = { html: writeResult.html, changes: [] as string[], qualityScore: writeScore.total }
  let revisionMeta: { triggered: boolean; scoreBefore: number; scoreAfter: number; failedChecks: string[] } | undefined
  let editSkipped = true

  if (writeScore.total < revisionThreshold && failedChecks.length > 0) {
    // Score is below threshold — run edit pass
    editSkipped = false
    console.log(`  ⚠ Score ${writeScore.total} < ${revisionThreshold} threshold (${item.articleType}) — running edit pass with ${failedChecks.length} failed checks`)
    const editStart = Date.now()
    editResult = await editArticle(writeResult.html, item.keyword, item.articleType, item.articleStyle, publishedPosts, failedChecks, analysisContext)
    onStep?.('edit', { elapsed: Date.now() - editStart, result: editResult as unknown as Record<string, unknown> })

    // Re-score after edit
    const editScore = scoreArticle({ html: editResult.html, ...scorerBase })
    console.log(`  ✓ Edited SEO score: ${editScore.total}/${editScore.maxTotal} (${editScore.grade}) — ${editScore.total >= writeScore.total ? '+' : ''}${editScore.total - writeScore.total} points`)

    revisionMeta = {
      triggered: true,
      scoreBefore: writeScore.total,
      scoreAfter: editScore.total,
      failedChecks: [...failedChecks],
    }
    currentScore = editScore

    // Additional revision pass if still below threshold (hubs get up to 2 passes)
    const maxPasses = item.articleType === 'hub' ? 2 : 1
    if (currentScore.total < revisionThreshold && maxPasses > 1) {
      const revisedFailedChecks = [
        ...ctaIssues,
        ...currentScore.categories.flatMap(cat =>
          cat.checks.filter(c => !c.passed).map(c => `[${cat.name}] ${c.name}: ${c.detail}`)
        ),
      ]
      if (revisedFailedChecks.length > 0) {
        console.log(`  ⚠ Score ${currentScore.total} still < ${revisionThreshold} — revision pass 2/2 with ${revisedFailedChecks.length} failed checks`)
        const revisionStart = Date.now()
        editResult = await editArticle(editResult.html, item.keyword, item.articleType, item.articleStyle, publishedPosts, revisedFailedChecks, analysisContext)
        onStep?.('revision', { elapsed: Date.now() - revisionStart, result: editResult as unknown as Record<string, unknown> })

        const revisedScore = scoreArticle({ html: editResult.html, ...scorerBase })
        console.log(`  ✓ Revised SEO score: ${revisedScore.total}/${revisedScore.maxTotal} (${revisedScore.grade}) — ${revisedScore.total >= currentScore.total ? '+' : ''}${revisedScore.total - currentScore.total} points`)
        revisionMeta.scoreAfter = revisedScore.total
        currentScore = revisedScore
      }
    }
  } else {
    console.log(`  ✓ Score ${writeScore.total} >= ${revisionThreshold} — skipping edit step (saving ~$0.12)`)
  }

  // Hard floor: articles below threshold after all passes get flagged for human review
  const suggestedStatus = currentScore.total < HARD_FLOOR_SCORE ? 'review' : 'draft'
  if (suggestedStatus === 'review') {
    console.log(`  ⚠ Final score ${currentScore.total} < ${HARD_FLOOR_SCORE} hard floor — flagging for human review`)
  }

  return {
    title: writeResult.title,
    html: editResult.html,
    excerpt: writeResult.excerpt,
    metaTitle: writeResult.metaTitle,
    metaDescription: writeResult.metaDescription,
    faqItems: writeResult.faqItems,
    suggestedCategory: writeResult.suggestedCategory,
    suggestedTags: analysis.suggestedTags,
    qualityScore: editResult.qualityScore,
    revision: revisionMeta,
    suggestedStatus,
    seoScore: currentScore,
    editSkipped,
  }
}
