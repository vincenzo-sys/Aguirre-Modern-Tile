import Anthropic from '@anthropic-ai/sdk'
import { Resvg } from '@resvg/resvg-js'
import { env, CLAUDE_MODEL, DOMAIN } from './config.js'
import { trackUsage } from './claude.js'
import { uploadMedia } from './payload.js'
import type { TileServiceData } from './tile-data.js'

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

const MAX_INFOGRAPHICS = 2

interface InfographicSpec {
  svg: string
  alt: string
  placement: string
}

interface InfographicResult {
  html: string
  count: number
}

/**
 * Extract data fields from the tile service JSON that are most useful for
 * visualizations: material costs, technique comparisons, pattern options, etc.
 * We trim to keep the prompt within reasonable token limits.
 */
function extractVisualizableData(tileData: TileServiceData): Record<string, unknown> {
  const data: Record<string, unknown> = {
    serviceType: tileData.serviceType,
    displayName: tileData.displayName,
  }

  // Include overview with cost ranges
  if (tileData.overview) {
    data.overview = tileData.overview
  }

  // Include materials with pricing for cost comparison charts
  if (tileData.materials && tileData.materials.length > 0) {
    data.materials = tileData.materials
  }

  // Include techniques for comparison visualizations
  if (tileData.techniques && tileData.techniques.length > 0) {
    data.techniques = tileData.techniques
  }

  // Include patterns for layout option visuals
  if (tileData.patterns && tileData.patterns.length > 0) {
    data.patterns = tileData.patterns
  }

  // Include local context (Boston-specific pricing and styles)
  if (tileData.localContext) {
    data.localContext = tileData.localContext
  }

  // Include brand data for price comparison
  if (tileData.brands && tileData.brands.length > 0) {
    data.brands = tileData.brands
  }

  return data
}

/**
 * Build the cached system prompt for infographic generation.
 * Contains brand guide, SVG rules, and tile service data -- identical across all articles
 * for the same service type, so it benefits from Anthropic's prompt caching.
 */
function buildInfographicSystem(vizData: Record<string, unknown>, serviceType: string): Anthropic.MessageCreateParams['system'] {
  return [
    {
      type: 'text' as const,
      text: `You are a data visualization designer for ${DOMAIN}, a professional tile installation company in Greater Boston, MA.
Create 1-2 SVG infographics that add the most value for readers considering tile work.

## Brand Style Guide
- Canvas size: 800x500 pixels
- Background: White (#ffffff)
- Primary color (headings, borders): Deep Blue #1e40af
- Accent color (CTAs, highlights): Amber #f59e0b
- Positive/value color: Emerald #22c55e
- Neutral text: Gray #64748b
- Font family: Arial, Helvetica, sans-serif (system-safe fonts only)
- Style: clean, modern, minimal -- no 3D effects, no gradients, no drop shadows
- All text must be legible at the rendered size (minimum 12px for body text, 18px+ for headings)
- Include "Source: ${DOMAIN}" in small gray text at the bottom-right

## Best Infographic Types for Tile Content
- **Cost comparison by material**: Bar chart comparing porcelain vs ceramic vs natural stone vs glass per sq ft
- **Installation method comparison**: Side-by-side comparing thin-set vs mastic vs mud-set
- **Room suitability matrix**: Grid showing which materials work best in bathroom, kitchen, outdoor, etc.
- **Pattern/layout options**: Visual comparison of herringbone, subway, chevron, basketweave, etc.
- **Project timeline**: Steps from demo to grout with typical duration
- **ROI comparison**: Cost vs home value increase for different tile upgrades
- **Maintenance comparison**: Frequency and effort by material type

## SVG Rules
- SVG must be fully self-contained: no <image>, no external fonts, no CSS @import, no xlink:href to external resources
- SVG must start with \`<svg\` and include explicit width="800" and height="500" attributes
- Use only <svg>, <rect>, <circle>, <ellipse>, <line>, <polyline>, <polygon>, <path>, <text>, <tspan>, <g>, <defs>, <clipPath>, <pattern> elements
- All colors must be inline (fill="..." or style="..."), not via external CSS classes
- Use data from the tile service JSON -- do NOT invent numbers
- Round dollar amounts to nearest dollar for readability
- Pick the chart type that best fits the data: bar chart, comparison table, icon grid, timeline, cost breakdown, process flow, etc.

## Output Format
Return ONLY a JSON object (no markdown fences, no explanation):
{
  "infographics": [
    {
      "svg": "<svg width=\\"800\\" height=\\"500\\" xmlns=\\"http://www.w3.org/2000/svg\\">...</svg>",
      "alt": "Descriptive alt text for SEO -- describe the data shown",
      "placement": "exact text snippet from the article (first 60 chars of a paragraph or heading) after which to insert this infographic"
    }
  ]
}`,
      cache_control: { type: 'ephemeral' as const },
    },
    {
      type: 'text' as const,
      text: `## Tile Service Data (${serviceType})\n\`\`\`json\n${JSON.stringify(vizData, null, 2)}\n\`\`\``,
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

/**
 * Extract a compact article summary for infographic context.
 * Instead of sending 12,000 chars of raw HTML, extract just the headings
 * and any data tables -- that is all the infographic generator needs to
 * pick relevant visualizations and placement points.
 */
function extractArticleContext(html: string): string {
  const lines: string[] = []

  // Extract H2/H3 headings
  const headingMatches = html.matchAll(/<h[23][^>]*>(.*?)<\/h[23]>/gi)
  for (const m of headingMatches) {
    lines.push(`- ${m[1].replace(/<[^>]+>/g, '')}`)
  }

  // Extract tables (important for knowing what data is already visualized)
  const tableMatches = html.matchAll(/<table[\s\S]*?<\/table>/gi)
  for (const m of tableMatches) {
    lines.push(m[0].slice(0, 500))
  }

  // First paragraph for topic context
  const firstPMatch = html.match(/<p[^>]*>(.*?)<\/p>/i)
  if (firstPMatch) {
    lines.push(`Opening: ${firstPMatch[1].replace(/<[^>]+>/g, '').slice(0, 200)}`)
  }

  return lines.join('\n')
}

/**
 * Build the user message for infographic generation (article-specific content only).
 */
function buildInfographicUserPrompt(articleHtml: string): string {
  const context = extractArticleContext(articleHtml)
  return `Analyze this article and create 1-2 infographics. Pick the most impactful visualizations for this specific topic. If the article is short or data does not lend itself to visualization, return just 1.

## Article Structure
${context}`
}

/**
 * Parse Claude's response text into InfographicSpec objects.
 */
function parseInfographicResponse(text: string): InfographicSpec[] {
  let cleaned = text.trim()

  // Strip markdown code fences if present
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim()
  }

  const parsed = JSON.parse(cleaned)

  if (!parsed.infographics || !Array.isArray(parsed.infographics)) {
    throw new Error('Response missing "infographics" array')
  }

  return parsed.infographics.slice(0, MAX_INFOGRAPHICS).map((item: Record<string, unknown>) => ({
    svg: String(item.svg || ''),
    alt: String(item.alt || 'Tile installation infographic'),
    placement: String(item.placement || ''),
  }))
}

/**
 * Validate that an SVG string has the basic structure needed for PNG conversion.
 */
function validateSvg(svg: string): { valid: boolean; error?: string } {
  if (!svg.trim().startsWith('<svg')) {
    return { valid: false, error: 'SVG does not start with <svg' }
  }

  if (!svg.includes('width=') || !svg.includes('height=')) {
    return { valid: false, error: 'SVG missing width or height attribute' }
  }

  if (!svg.includes('</svg>')) {
    return { valid: false, error: 'SVG missing closing </svg> tag' }
  }

  // Check for disallowed external resources
  if (svg.includes('xlink:href="http') || svg.includes('<image')) {
    return { valid: false, error: 'SVG contains external resources (not allowed)' }
  }

  return { valid: true }
}

/**
 * Convert SVG string to PNG buffer using resvg-js.
 *
 * resvg-js uses a Rust-based SVG renderer that handles <text> elements,
 * system fonts, and complex SVG features far better than sharp's librsvg.
 * This fixes blank/garbled text in Claude-generated infographic SVGs.
 */
function svgToPng(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 800 },
    font: {
      loadSystemFonts: true,
    },
  })
  const rendered = resvg.render()
  return Buffer.from(rendered.asPng())
}

/**
 * Find the best insertion point in the HTML for a given placement hint.
 * Returns the index in the HTML string after which to insert the <img> tag.
 *
 * Strategy: search for the placement text snippet within the HTML, then find
 * the end of the enclosing block element.
 */
function findInsertionPoint(html: string, placement: string): number {
  if (!placement) return -1

  // Normalize placement text for matching
  const normalizedPlacement = placement.replace(/\s+/g, ' ').trim().slice(0, 80)

  // Search for the placement text in the HTML (strip tags for matching)
  const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const matchIndex = plainText.toLowerCase().indexOf(normalizedPlacement.toLowerCase().slice(0, 40))

  if (matchIndex === -1) return -1

  // Map the plain-text index back to an approximate HTML position
  // Walk through the HTML, tracking plain-text offset
  let plainOffset = 0
  let inTag = false
  let htmlPos = 0

  for (htmlPos = 0; htmlPos < html.length && plainOffset < matchIndex; htmlPos++) {
    if (html[htmlPos] === '<') {
      inTag = true
    } else if (html[htmlPos] === '>') {
      inTag = false
    } else if (!inTag) {
      plainOffset++
    }
  }

  // From this position, find the next closing block tag
  const closingTagPattern = /<\/(p|h[1-6]|ul|ol|table|div|blockquote|figure|section)>/gi
  closingTagPattern.lastIndex = htmlPos
  const closeMatch = closingTagPattern.exec(html)

  if (closeMatch) {
    return closeMatch.index + closeMatch[0].length
  }

  return -1
}

/**
 * Main entry point: generate infographics for an article.
 *
 * Calls Claude to analyze the article + tile service data and produce SVG infographics,
 * converts them to PNG, uploads to Payload, and injects <img> tags into the HTML.
 */
export async function generateInfographics(
  html: string,
  tileData: TileServiceData,
  serviceType: string,
): Promise<InfographicResult> {
  // Extract the subset of tile data most useful for visualization
  const vizData = extractVisualizableData(tileData)

  // Call Claude with cached system prompt (brand guide + tile data)
  // and compact user message (article headings + tables only)
  const system = buildInfographicSystem(vizData, serviceType)
  const userPrompt = buildInfographicUserPrompt(html)

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16384,
    system,
    messages: [{ role: 'user', content: userPrompt }],
  })

  // Track infographic token usage
  trackUsage('infographics', response.usage)

  const responseText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('')

  // Parse the JSON response
  let specs: InfographicSpec[]
  try {
    specs = parseInfographicResponse(responseText)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`  Warning: Could not parse infographic response: ${msg}`)
    return { html, count: 0 }
  }

  if (specs.length === 0) {
    console.log('  No infographics returned by Claude')
    return { html, count: 0 }
  }

  // Process each infographic: validate, convert, upload, inject
  let modifiedHtml = html
  let successCount = 0

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]
    const label = `infographic ${i + 1}/${specs.length}`

    // Validate SVG
    const validation = validateSvg(spec.svg)
    if (!validation.valid) {
      console.log(`  Warning: Skipping ${label}: ${validation.error}`)
      continue
    }

    // Convert SVG to PNG
    let pngBuffer: Buffer
    try {
      pngBuffer = svgToPng(spec.svg)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`  Warning: SVG-to-PNG conversion failed for ${label}: ${msg}`)
      continue
    }

    // Upload PNG to Payload media library
    let mediaId: string
    let mediaUrl: string
    try {
      const filename = `${serviceType.toLowerCase()}-infographic-${i + 1}-${Date.now()}.png`
      const media = await uploadMedia(pngBuffer, filename, spec.alt)
      mediaId = media.doc?.id || media.id
      mediaUrl = media.doc?.url || media.url
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`  Warning: Upload failed for ${label}: ${msg}`)
      continue
    }

    // Build the <img> tag (matches the format resolveInlineImages uses)
    const escapedAlt = spec.alt.replace(/"/g, '&quot;')
    const captionText = spec.alt.replace(/</g, '&lt;')
    const imgTag = `<img data-media-id="${mediaId}" src="${mediaUrl}" alt="${escapedAlt}" data-width="800" data-height="500" />`
    const wrappedImg = `<figure>${imgTag}<figcaption>${captionText}</figcaption></figure>`

    // Find insertion point and inject
    const insertPos = findInsertionPoint(modifiedHtml, spec.placement)
    if (insertPos !== -1) {
      modifiedHtml = modifiedHtml.slice(0, insertPos) + '\n' + wrappedImg + '\n' + modifiedHtml.slice(insertPos)
    } else {
      // Fallback: insert around the 60% mark of the article
      const fallbackPos = Math.floor(modifiedHtml.length * 0.6)
      const fallbackInsert = modifiedHtml.indexOf('</p>', fallbackPos)
      if (fallbackInsert !== -1) {
        const pos = fallbackInsert + '</p>'.length
        modifiedHtml = modifiedHtml.slice(0, pos) + '\n' + wrappedImg + '\n' + modifiedHtml.slice(pos)
      } else {
        // Last resort: append at the end
        modifiedHtml += '\n' + wrappedImg + '\n'
      }
      console.log(`  Warning: Could not find placement for ${label} -- used fallback position`)
    }

    successCount++
    console.log(`  Infographic ${successCount}: "${spec.alt.slice(0, 60)}"`)
  }

  return { html: modifiedHtml, count: successCount }
}
