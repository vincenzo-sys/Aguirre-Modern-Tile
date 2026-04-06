import { DOMAIN, BLOG_BASE_URL } from '../config.js'
import type { QueueItem } from '../queue.js'
import type { PublishedPost } from '../payload.js'

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
  competitorBenchmarks?: {
    avgWordCount: number
    avgH2Count: number
    avgListCount: number
    avgTableCount: number
    avgLinkCount: number
  }
}

function getArticleTypeInstructions(item: QueueItem): string {
  switch (item.articleType) {
    case 'hub':
      return `This is a HUB article — the main pillar page for ${item.keyword}.
- Write a comprehensive overview covering ALL aspects of this tile topic
- Each H2 section should briefly introduce a subtopic and include a CTA link to the sub-pillar article
- Use links in this format: <a href="${BLOG_BASE_URL}/[sub-pillar-slug]">Read our complete guide to [topic]</a>
- The tone should be authoritative and comprehensive — this is THE definitive guide
- Example: "Complete Guide to Bathroom Tile Installation in Boston"
- Target length: ${item.targetWords ? `${item.targetWords}-${item.targetWords + 500} words` : '3000-3500 words'}`

    case 'sub-pillar':
      return `This is a SUB-PILLAR (pillar) article — a detailed guide on a specific aspect of tile installation.
- Start the introduction with a link back to the hub: <a href="${BLOG_BASE_URL}/${item.hubSlug}">${item.keyword} Complete Guide</a>
- Go deep on this specific topic — more detail than the hub provides
- Example: "Porcelain vs Ceramic Tile: Which Is Right for Your Bathroom?"
- You MUST include at least 2 contextual links to sibling articles (not just the hub). Use natural anchor text containing the sibling's primary keyword. Place cross-links within relevant H2 sections, not bunched in one paragraph.
- Target length: ${item.targetWords ? `${item.targetWords}-${item.targetWords + 500} words` : '2000-2500 words'}`

    case 'spoke':
      return `This is a SPOKE article — a focused, specific piece about a narrow tile topic.
- Include a link to the parent sub-pillar: <a href="${BLOG_BASE_URL}/${item.parentSlug}">Back to [parent topic]</a>
- Include a link to the hub: <a href="${BLOG_BASE_URL}/${item.hubSlug}">[hub topic] Complete Guide</a>
- Example: "How Much Does Shower Tile Installation Cost in Massachusetts?"
- You MUST include at least 1 contextual link to a sibling article. Use natural anchor text containing the sibling's primary keyword.
- Very focused on one specific question or niche topic
- Target length: ${item.targetWords ? `${item.targetWords}-${item.targetWords + 500} words` : '1000-1500 words'}`

    default:
      return `Write a standard blog article about tile installation.
- Target length: 1200-1500 words`
  }
}

type ArticleStyle = 'standard' | 'narrative' | 'listicle' | 'data-heavy' | 'comparison' | 'how-to'

function getStyleInstructions(style: ArticleStyle, item: QueueItem): string {
  switch (style) {
    case 'narrative':
      return `**Article Style: NARRATIVE**
- Open with a homeowner scenario (2-3 sentences painting a relatable situation), then deliver the direct answer.
- Do NOT include a "Key Takeaways" section at the top — instead, weave key facts naturally into the narrative.
- Use lists sparingly — only when listing genuinely distinct items (e.g., tile types, material options). Prefer flowing prose.
- Use statement headings ("The Right Tile for a Small Bathroom") rather than questions. Questions are okay occasionally but should not dominate.
- The tone should feel like a knowledgeable contractor sharing honest advice, not an encyclopedia entry.`

    case 'listicle':
      return `**Article Style: LISTICLE**
- Open with a numbered hook (e.g., "7 things every homeowner should know about tile installation"). Key Takeaways section is optional.
- Use numbered H2 headings: "1. [Topic]", "2. [Topic]", etc. — do NOT phrase them as questions.
- Include bulleted details under each numbered heading.
- Heavy use of lists throughout — this format should feel scannable and snackable.
- Keep each numbered section focused: one main point with supporting details.`

    case 'data-heavy':
      return `**Article Style: DATA-HEAVY**
- Open with a quick cost comparison list (3-4 tile options with $/sq ft rates), then a 1-sentence summary.
- Heavy use of comparison lists and pricing breakdowns throughout.
- Include specific numbers wherever possible: costs per sq ft, installation time per room, material quantities.
- Mix question and statement headings — use whichever best fits the data being presented.
- The tone should feel like a well-researched consumer report.`

    case 'comparison':
      return `**Article Style: COMPARISON**
- Open with "Choosing between [option A] and [option B]?" framing — present the comparison from the very first sentence.
- Every section should include side-by-side comparison elements (pros/cons, feature-by-feature lists).
- Use "[Option A] vs [Option B]" heading format where applicable.
- Include comparison lists in every major section — readers are here to decide between options.
- Conclude with a clear recommendation based on different homeowner needs (budget, durability, style, maintenance).`

    case 'how-to':
      return `**Article Style: HOW-TO**
- Open with a brief overview of what the reader will learn, followed by a "Tools & Materials Needed" section as a <ul>.
- Use numbered H2 headings for each major step: "Step 1: [Action]", "Step 2: [Action]", etc.
- Include "Pro Tip" callouts using <blockquote> for insider advice from experienced installers.
- Each step should have clear, actionable instructions with specific measurements, times, and techniques.
- Include warnings about common mistakes using <strong> emphasis.
- End with a "When to Call a Professional" section — be honest about DIY limits.`

    case 'standard':
    default:
      return `**Article Style: STANDARD**
- Open with a direct answer to the main query, followed by a "Key Takeaways" bulleted list.
- Use question-format H2 headings where natural.
- Natural mix of lists and prose throughout.
- This is the default structure — balanced and comprehensive.`
  }
}

function formatPublishedPosts(posts: PublishedPost[]): string {
  if (posts.length === 0) return ''

  const lines = [
    '\n**Published articles you can link to (use EXACT slugs):**',
    ...posts.map(p => `- ${BLOG_BASE_URL}/${p.slug} — "${p.title}" (${p.articleType})`),
    'ONLY link to slugs from this list. Do NOT invent blog URLs.\n',
  ]
  return lines.join('\n')
}

interface ClusterArticle {
  slug: string
  title: string
  articleType: string
  keyword?: string
  headings: { level: number; text: string }[]
  excerpt: string
}

function formatClusterContext(clusterArticles: ClusterArticle[], item: QueueItem): string {
  if (clusterArticles.length === 0) return ''

  const lines: string[] = ['\n**Cluster Content Context (DO NOT repeat — link instead):**']
  lines.push(`You are writing a ${item.articleType}. These sibling articles already exist for this topic cluster:`)

  for (const article of clusterArticles) {
    const h2s = article.headings.filter(h => h.level === 2).map(h => h.text)
    const keywordNote = article.keyword ? ` | keyword: "${article.keyword}"` : ''
    lines.push(`- "${article.title}" (${article.articleType}) — ${BLOG_BASE_URL}/${article.slug}${keywordNote}`)
    if (h2s.length > 0) {
      lines.push(`  Covers: ${h2s.join(', ')}`)
    }
  }

  lines.push('')
  lines.push('IMPORTANT: Do NOT repeat content already covered in depth by the hub or siblings above.')
  lines.push('Instead, reference them with contextual links using natural anchor text that includes the sibling\'s keyword.')
  lines.push('Go deeper on YOUR specific angle that siblings do not cover.')
  lines.push('CROSS-LINKING IS MANDATORY: You MUST link to at least 2 sibling articles (not just the hub/pillar). Place these links within relevant H2 sections where the sibling topic naturally comes up — do NOT bunch them in one paragraph or the conclusion.\n')

  return lines.join('\n')
}

export function buildWritePrompt(
  item: QueueItem,
  analysis: AnalysisResult,
  publishedPosts?: PublishedPost[],
  clusterArticles?: ClusterArticle[]
): string {
  const outlineSection = item.outline?.length
    ? `\n\nFollow this outline:\n${item.outline.map((o) => `${o.order}. ${o.heading}${o.summary ? ` — ${o.summary}` : ''}${o.linksTo ? ` [Link to: ${BLOG_BASE_URL}/${o.linksTo}]` : ''}`).join('\n')}`
    : `\n\nUse these recommended headings:\n${analysis.recommendedH2s.map((h, i) => `${i + 1}. ${h}`).join('\n')}`

  return `You are a professional home improvement and tile installation content writer for ${DOMAIN}.

**Company Context:** Aguirre Modern Tile — Professional tile installation in Greater Boston, MA. 15+ years experience. Services: bathroom tile, shower tile, floor tile, backsplash, tile repair, tile reglazing. Owner: Christian Aguirre.

Write an SEO-optimized blog article with the following parameters:

**Focus keyword:** ${item.keyword} — this is the exact search query we want to rank for
**URL slug:** ${item.slug}

**Generate an article title** (50-65 characters) that:
- Contains the EXACT focus keyword, placed as close to the front as possible
- Is compelling and specific — generated based on competitive analysis of what ranks
- Omits the year unless content is genuinely time-sensitive
- Hub = authoritative guide title; Sub-pillar = deep-dive title; Spoke = specific answer title
- Do NOT include any brand suffix like "| Aguirre Modern Tile" — the website template appends it automatically

${getArticleTypeInstructions(item)}
${publishedPosts && publishedPosts.length > 0 ? formatPublishedPosts(publishedPosts) : ''}${clusterArticles && clusterArticles.length > 0 ? formatClusterContext(clusterArticles, item) : ''}
${getStyleInstructions(item.articleStyle || 'standard', item)}
${outlineSection}

${analysis.competitorBenchmarks ? `**Competitor Benchmarks (match or exceed):**
- Average word count: ${analysis.competitorBenchmarks.avgWordCount}
- Average H2 headings: ${analysis.competitorBenchmarks.avgH2Count}
- Average lists: ${analysis.competitorBenchmarks.avgListCount}
- Average tables: ${analysis.competitorBenchmarks.avgTableCount}
- Average links: ${analysis.competitorBenchmarks.avgLinkCount}
` : ''}**Topics to cover (from competitor analysis):** ${analysis.commonTopics.join(', ')}
**Content gaps to fill (unique angles):** ${analysis.gaps.join(', ')}${analysis.topicGaps?.length ? `\n**Topic gaps (NO competitor covers these — high-value differentiation):** ${analysis.topicGaps.join(', ')}` : ''}${analysis.depthGaps?.length ? `\n**Depth gaps (competitors mention but cover shallowly):** ${analysis.depthGaps.join(', ')}` : ''}${analysis.dataGaps?.length ? `\n**Data gaps (specific missing data points):** ${analysis.dataGaps.join(', ')}` : ''}${analysis.entityFrequency?.length ? `\n**Key entities to mention (by competitor frequency):** ${analysis.entityFrequency.slice(0, 8).map(e => `${e.entity} (${e.mentions}x)`).join(', ')}` : ''}${analysis.structuralPatterns?.length ? `\n**Structural patterns to match:** ${analysis.structuralPatterns.join('; ')}` : ''}

**Writing rules:**
1. Output ONLY clean HTML using these tags: h2, h3, p, ul, ol, li, a, strong, em, blockquote, table, thead, tbody, tr, th, td, img
2. Do NOT use: h1, div, span, inline styles, classes, or IDs
3. Do NOT include the article title as an h1 — it's handled separately
4. All internal links use format: ${BLOG_BASE_URL}/[slug]
5. External links: USE only real, verifiable URLs to authoritative sources (TCNA, manufacturer sites, home improvement authorities). Add rel="nofollow" to commercial links. Do NOT invent external URLs.
6. Use natural keyword placement — target keyword in first paragraph, 2-3 H2s, and conclusion
7. Write in a friendly, helpful, authoritative voice — not corporate
8. Include specific details: material costs per sq ft, installation timelines, tool requirements, pro tips
9. Use "Aguirre Modern Tile" when referencing our company with a link to https://www.${DOMAIN}

**Estimate CTAs (CRITICAL for conversions — must be CONTEXTUAL, not generic):**
10. EARLY CTA: Within the first 500 words, include an estimate CTA that references something specific from the surrounding content. The CTA MUST include a specific detail from the article (a room type, tile material, or budget range). Example: "Get a free estimate for your bathroom tile installation — send us photos for a same-day quote." Do NOT use generic phrases like "Contact us for a quote" — always reference the specific project type. Link to https://www.${DOMAIN}/contact or https://www.${DOMAIN}/quote.
11. CLOSING CTA: In the final section, include a CTA that ties back to the article's main promise. Example: "Ready to transform your bathroom with porcelain tile? Schedule a free consultation with Aguirre Modern Tile." Link to https://www.${DOMAIN}/contact or https://www.${DOMAIN}/quote.

**Readability (CRITICAL — target Flesch-Kincaid grade 6-9):**
12. SENTENCE LENGTH: Keep sentences SHORT. Average sentence length should be 15-20 words. Mix it up: some sentences 8-12 words, some 20-25, but never exceed 30 words in a single sentence. Break complex ideas into multiple simple sentences.
13. SIMPLE WORDS: Prefer common words over fancy ones. "use" not "utilize", "help" not "facilitate", "start" not "commence", "near" not "in proximity to". Write at an 8th-grade reading level.
14. ACTIVE VOICE: Use active voice ("We spread the thin-set evenly") not passive ("The thin-set is spread evenly"). Active voice is shorter and easier to parse.
15. NO COMPOUND SENTENCES: Avoid stringing clauses together with semicolons or multiple commas. Instead of "The installer applies thin-set mortar to the substrate, which needs to be leveled first, and then sets each tile carefully while maintaining consistent spacing" — write two or three sentences.

**Readability Examples (follow this quality bar):**
BAD: "While the process of installing porcelain tile in a bathroom requires careful consideration of substrate preparation, waterproofing membrane application, and thin-set mortar selection, it's worth noting that professional installation can significantly extend the lifespan of your investment."
GOOD: "Professional bathroom tile installation starts with a solid substrate. We apply waterproofing membrane, then set tiles with the right mortar. Done right, your tile lasts 20+ years."

BAD: "For homeowners seeking to maximize the aesthetic appeal of their kitchen while maintaining budgetary constraints, subway tile represents the most cost-effective option available for backsplash applications."
GOOD: "Subway tile is the most affordable backsplash option at $3-6 per square foot installed. It fits any kitchen style. Most backsplash projects finish in one day."

**AI Search & Featured Snippet Optimization (CRITICAL — follow these closely):**
16. OPENING ANSWER: The very first paragraph must be a concise, direct answer to the main query implied by the title. It should be extractable on its own — if someone only read this one paragraph, they'd get the core answer. AI search engines pull this as the primary citation.
17. KEY TAKEAWAYS: For standard, data-heavy, and comparison styles, immediately after the opening answer include a "Key Takeaways" section using a <ul> with 4-6 bullet points summarizing the most important facts. Bold the lead phrase of each bullet with <strong>. Skip this for narrative style (weave facts into prose instead), listicle style (the numbered format serves this purpose), and how-to style (the steps serve this purpose).
18. USE LISTS NATURALLY: Include <ul> or <ol> lists in most sections where they fit — options, steps, tips, comparisons, pros/cons. Don't force a list into a section that reads better as narrative, but when you're presenting multiple items, always use a list rather than burying them in paragraph form.
19. ANSWER-FIRST SECTIONS: Begin each H2 section with a concise 1-2 sentence direct answer before elaborating. AI systems extract the first clear statement after a heading.
20. QUESTION HEADINGS: For standard and data-heavy styles, frame H2s as questions where natural (e.g., "How Much Does Bathroom Tile Cost?" not "Bathroom Tile Costs"). For listicle and how-to styles, keep numbered/step headings as statements. For narrative style, prefer statement headings. This rule is OVERRIDDEN by the style instructions above when they conflict.
21. DEFINITION PATTERN: When genuinely introducing a new concept the reader may not know, use the "What is X? X is..." pattern as an H3. Don't overuse this — it's for terms that actually need defining (e.g., "thin-set mortar", "backer board", "waterproofing membrane"), not for obvious concepts.
22. COMPARISONS: Include at least one comparison section using a structured list (e.g., "<h3>Porcelain vs Ceramic Tile</h3>" with a <ul> comparing key differences side by side).
23. SOURCE ATTRIBUTION: When citing facts you're confident about, attribute them to real sources (e.g., "according to TCNA guidelines", "per HomeAdvisor data", "based on current material prices"). NEVER fabricate a source or attribution — if you're not sure who published a fact, use softer language like "homeowners typically spend" or "based on current Boston-area rates" instead.
24. E-E-A-T SIGNALS: Use phrases like "based on current material prices", "in our 15+ years of experience", "as certified installers", "across over 500 completed projects" to signal expertise and first-hand experience.
25. BOLD KEY TERMS: Use <strong> to highlight key terms, names, and important phrases throughout the article. This helps AI systems identify the most important concepts for extraction.
26. ENTITY COVERAGE: Mention related entities thoroughly — tile types (porcelain, ceramic, natural stone, glass mosaic), brands (Schluter, Mapei, Laticrete, Daltile, MSI), installation components (thin-set, grout, backer board, waterproofing membrane, DITRA), design patterns (herringbone, subway, basketweave, hexagon), and tools (wet saw, tile cutter, float, spacers). Entity density helps NLP systems gauge content depth.
27. FRESHNESS SIGNALS: For things that genuinely change (material prices, labor rates, design trends), include timeframe references like "as of 2026" or "current pricing". Don't add year references to evergreen facts that don't change — it just dates the content unnecessarily.
28. PARAGRAPH LENGTH: Keep paragraphs to 3-5 sentences (80-120 words). Long enough to develop a point, short enough for AI to parse and extract. Never exceed 5 sentences in a single paragraph.
29. NO FILLER: Every sentence must contain a fact, a tip, or a specific actionable detail. Remove any sentence that exists just to fill space or transition generically.
30. COMPARISON TABLES: For pricing data and side-by-side comparisons, use HTML tables (<table>, <thead>, <tbody>, <tr>, <th>, <td>). Tables are especially valuable in data-heavy and comparison style articles. Include at least one table when comparing tile materials, costs, or features. CRITICAL: Every row in a comparison table MUST use REAL, specific tile types, brands, or materials (e.g., "Daltile Porcelain", "MSI Calacatta Gold", "Schluter DITRA"). NEVER use vague categories like "Budget Option" or "Premium Choice" — readers need real product names they can research and buy.
31. VERIFICATION DATES: When citing specific costs, labor rates, or time-sensitive facts, add "(as of 2026 pricing)" or "(based on current Greater Boston rates)" inline. This builds trust and signals freshness.
32. PAA TARGETS: Include 2-3 "People Also Ask" style questions as H2 or H3 headings, targeting common related queries that searchers ask about this topic. For example, if writing about bathroom tile costs, include headings like "Is It Worth Hiring a Professional Tile Installer?" or "How Long Does a Bathroom Tile Job Take?"
33. NO FAQ SECTION IN HTML: Do NOT include a "Frequently Asked Questions" section in the HTML body. FAQs are returned separately in the faqItems JSON field and rendered as a dedicated accordion component on the page. Including them in the HTML causes duplicate rendering.
34. DEFINITION-FIRST OPENING: The very first sentence of the article MUST be a clear, standalone definition using the "X is..." pattern. It must pass the "island test" — if this sentence appeared alone on a search results page with no surrounding context, the reader would understand what the article is about. Example: "Bathroom tile installation is a multi-step process that transforms your space with durable, waterproof surfaces — typically costing $8-25 per square foot for professional installation in the Greater Boston area." This is DIFFERENT from rule 16 (opening answer paragraph) — rule 16 is about answering the query; this rule is about the sentence structure of the FIRST sentence being a definition.
35. VERIFIABLE STATISTICS: Include at least 3-5 specific, data-backed statistics per article. Present costs as per-square-foot ranges, timelines in days, and material quantities in specific units. Bold statistics with <strong> so AI engines can extract them. Attribute data to its source (e.g., "based on current Greater Boston rates" or "per TCNA installation standards"). NEVER fabricate statistics — only use numbers that are realistic and verifiable for the Boston-area market.
36. NO AI SLOP: Never use these phrases — they are an instant quality fail: "In conclusion", "It's worth noting", "Whether you're a seasoned homeowner or", "It's important to note", "invaluable", "game-changer", "Let's dive in", "Read on to learn", "In this guide we'll cover", "Without further ado", "In today's world", "Look no further", "Navigating the world of", "Ever-evolving", "It goes without saying", "Needless to say", "At the end of the day", "When it comes to". Write like a knowledgeable contractor, not a chatbot.
37. META DESCRIPTION LENGTH: The metaDescription field MUST be 120-160 characters. This is a hard requirement — under 120 wastes SERP real estate, over 160 gets truncated by Google.
Respond with ONLY valid JSON in this exact format:
{
  "title": "Display title for the article (50-65 chars, keyword-rich, compelling)",
  "html": "<h2>First Section</h2><p>Content...</p>...",
  "excerpt": "A brief 1-2 sentence summary for SEO (max 300 chars)",
  "metaTitle": "SEO title (max 60 chars, shorter variant of title)",
  "metaDescription": "SEO description (max 160 chars)",
  "earlyCta": "The exact text of your early CTA (e.g., 'Get a free estimate for your bathroom tile project')",
  "closingCta": "The exact text of your closing CTA (e.g., 'Schedule your free tile installation consultation today')",
  "faqItems": [
    {"question": "Question?", "answer": "Answer text"},
    ...
  ],
  "suggestedCategory": "Tile Installation"
}`
}


/**
 * Static writing rules block — for use as cacheable system prompt.
 * Identical across all articles, enabling prompt caching.
 */
export function getWritingRulesBlock(): string {
  return `**Condensed writing rules for ${DOMAIN}:**
1. Output ONLY clean HTML: h2, h3, p, ul, ol, li, a, strong, em, blockquote, table, thead, tbody, tr, th, td, img. No h1/div/span/styles/classes/IDs.
2. Internal links: ${BLOG_BASE_URL}/[slug]. External links: ONLY real, verifiable URLs. Add rel="nofollow" to commercial links.
3. Natural keyword placement in first paragraph, 2-3 H2s, conclusion. Friendly authoritative voice.
4. EARLY CTA within 500 words (contextual, specific). CLOSING CTA in final section. Both link to https://www.${DOMAIN}/contact or /quote.
5. Readability: grade 6-9. Sentences 15-20 words avg, never >30. Simple words. Active voice.
6. Opening answer paragraph (extractable standalone). Key Takeaways <ul> after (standard/data-heavy/comparison only).
7. Question H2s where natural. Answer-first sections. Lists where they fit.
8. Real source attribution. E-E-A-T language ("15+ years experience", "certified installer", "500+ projects"). Bold key terms. Entity coverage.
9. Freshness signals for time-sensitive data. 3-5 sentence paragraphs. Zero filler.
10. Comparison tables use REAL tile types/brands/materials (never generic categories).
11. Verification dates: "(as of 2026 pricing)" or "(based on current Greater Boston rates)". 2-3 PAA question headings.
12. NO FAQ section in HTML (goes in faqItems JSON). No brand suffix in title.
13. Definition-first opening: First sentence MUST be "X is..." standalone definition (island test). Different from opening answer paragraph — this is about sentence structure.
14. Include 3-5+ verifiable statistics per article. Bold stats with <strong>. Attribute sources. Never fabricate numbers.
15. NO AI SLOP: Never use: "In conclusion", "It's worth noting", "Whether you're a", "game-changer", "invaluable", "Let's dive in", "Read on to learn", "When it comes to", "At the end of the day", "Without further ado". Write like a contractor.
16. Meta description MUST be 120-160 characters (hard requirement).`
}
