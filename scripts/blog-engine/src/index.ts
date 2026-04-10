import { Command } from 'commander'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getNextQueuedItems, validatePrerequisites, markGenerating, markDraft, markError, markPublished, getBatchItems } from './queue.js'
import type { QueueItem } from './queue.js'
import { scrapeCompetitors } from './scraper.js'
import type { ScrapedArticle } from './scraper.js'
import { generateArticle, resetTokenTracking, getTokenSummary, setCurrentStep } from './claude.js'
import { htmlToLexical } from './html-to-lexical.js'
import { generateInfographics } from './infographics.js'
import { getUnsplashPhoto } from './unsplash.js'
import {
  createPost,
  updatePost,
  findPostBySlug,
  uploadMedia,
  findOrCreateCategory,
  findOrCreateTag,
  getApiUser,
  getQueueItems,
  getAllPublishedSlugs,
  updateQueueItem,
  getClusterUsedPhotoIds,
} from './payload.js'
import { env } from './config.js'
import { loadTileServiceData } from './tile-data.js'
import { scoreArticle, printSeoScore } from './seo-scorer.js'
import type { SeoScore } from './seo-scorer.js'
import { lexicalToHtml } from './lexical-to-html.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const logsDir = path.resolve(__dirname, '..', 'logs')

/**
 * Strip any "Frequently Asked Questions" section from HTML body.
 * FAQs are stored as structured faqItems and rendered by FaqAccordion --
 * having them in the HTML body too causes duplicate rendering.
 */
function stripFaqSection(html: string): string {
  // Match an H2 starting with "frequently asked questions" or "FAQ" (case-insensitive)
  // and everything after it until the next H2 or end of string
  const faqPattern = /<h2[^>]*>\s*(?:frequently\s+asked\s+questions|faqs?)\b[^<]*<\/h2>[\s\S]*?(?=<h2[\s>]|$)/i
  const stripped = html.replace(faqPattern, '')
  if (stripped.length < html.length) {
    console.log('  Stripped FAQ section from HTML body (rendered separately via FaqAccordion)')
  }
  return stripped
}

interface ArticleReport {
  timestamp: string
  queueItemId: string
  title: string
  slug: string
  keyword: string
  articleType: string
  serviceType: string
  priority: string
  scraping: {
    searchedKeyword: string
    urlsFound: number
    urlsScraped: number
    urlsFailed: number
    articles: {
      url: string
      title: string
      headingsFound: number
      status: 'success' | 'failed'
    }[]
  }
  analysis: {
    commonTopics: string[]
    contentGaps: string[]
    recommendedH2s: string[]
    faqQuestions: string[]
    suggestedTags: string[]
  }
  article: {
    htmlLength: number
    estimatedWordCount: number
    faqCount: number
    excerpt: string
    metaTitle: string
    metaDescription: string
    suggestedCategory: string
  }
  editing: {
    changesCount: number
    qualityScore: number
    changes: string[]
  }
  infographics: {
    count: number
  }
  image: {
    found: boolean
    filename: string | null
    alt: string | null
    mediaId: string | null
  }
  post: {
    postId: string | null
    status: string
    categoryCreated: string
    tagsCreated: string[]
  }
  timing: {
    totalSeconds: number
    scrapeSeconds: number
    analyzeSeconds: number
    writeSeconds: number
    editSeconds: number
    uploadSeconds: number
  }
  seoScore: SeoScore | null
  revision: {
    triggered: boolean
    scoreBefore: number
    scoreAfter: number
    failedChecks: string[]
  } | null
  tokenUsage?: {
    totalInput: number
    totalOutput: number
    totalCacheRead: number
    totalCacheWrite: number
    totalCost: number
    steps: { step: string; input: number; output: number; cost: number }[]
  }
  error: string | null
}

function saveReport(report: ArticleReport) {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true })
  }

  const date = new Date().toISOString().slice(0, 10)
  const safeSlug = report.slug.slice(0, 50)
  const filename = `${date}_${safeSlug}.json`
  const filepath = path.join(logsDir, filename)

  fs.writeFileSync(filepath, JSON.stringify(report, null, 2))
  return filepath
}

function printReport(report: ArticleReport) {
  console.log('\n  +---------------------------------------------------------+')
  console.log('  |              GENERATION REPORT                          |')
  console.log('  +---------------------------------------------------------+')

  console.log(`\n  Article: ${report.title}`)
  console.log(`  Slug: ${report.slug}`)
  console.log(`  Type: ${report.articleType} | Service: ${report.serviceType} | Priority: ${report.priority}`)

  console.log(`\n  SCRAPING:`)
  console.log(`    Keyword searched: "${report.scraping.searchedKeyword}"`)
  console.log(`    URLs found: ${report.scraping.urlsFound} | Scraped: ${report.scraping.urlsScraped} | Failed: ${report.scraping.urlsFailed}`)
  for (const a of report.scraping.articles) {
    const icon = a.status === 'success' ? '[ok]' : '[fail]'
    console.log(`    ${icon} ${a.title || a.url} (${a.headingsFound} headings)`)
  }

  console.log(`\n  ANALYSIS:`)
  console.log(`    Common topics: ${report.analysis.commonTopics.join(', ')}`)
  console.log(`    Content gaps: ${report.analysis.contentGaps.join(', ')}`)
  console.log(`    Recommended H2s: ${report.analysis.recommendedH2s.length}`)
  console.log(`    FAQ questions: ${report.analysis.faqQuestions.length}`)
  console.log(`    Tags: ${report.analysis.suggestedTags.join(', ')}`)

  console.log(`\n  ARTICLE:`)
  console.log(`    HTML length: ${report.article.htmlLength.toLocaleString()} chars`)
  console.log(`    Est. word count: ~${report.article.estimatedWordCount.toLocaleString()}`)
  console.log(`    FAQs: ${report.article.faqCount}`)
  console.log(`    Meta title: ${report.article.metaTitle}`)
  console.log(`    Category: ${report.article.suggestedCategory}`)

  console.log(`\n  EDITING:`)
  console.log(`    Quality score: ${report.editing.qualityScore}/100`)
  console.log(`    Changes made: ${report.editing.changesCount}`)
  for (const c of report.editing.changes.slice(0, 5)) {
    console.log(`    - ${c}`)
  }
  if (report.editing.changes.length > 5) {
    console.log(`    ... and ${report.editing.changes.length - 5} more`)
  }

  if (report.revision) {
    console.log(`\n  REVISION:`)
    console.log(`    Triggered: ${report.revision.triggered ? 'Yes' : 'No'}`)
    if (report.revision.triggered) {
      console.log(`    Score before: ${report.revision.scoreBefore}`)
      console.log(`    Score after: ${report.revision.scoreAfter}`)
      console.log(`    Improvement: ${report.revision.scoreAfter - report.revision.scoreBefore >= 0 ? '+' : ''}${report.revision.scoreAfter - report.revision.scoreBefore} points`)
      console.log(`    Failed checks addressed: ${report.revision.failedChecks.length}`)
    }
  }

  console.log(`\n  INFOGRAPHICS:`)
  console.log(`    Generated: ${report.infographics.count}`)

  console.log(`\n  IMAGE:`)
  if (report.image.found) {
    console.log(`    File: ${report.image.filename}`)
    console.log(`    Alt: ${report.image.alt}`)
    console.log(`    Media ID: ${report.image.mediaId}`)
  } else {
    console.log(`    No image uploaded`)
  }

  console.log(`\n  POST:`)
  console.log(`    Post ID: ${report.post.postId}`)
  console.log(`    Status: ${report.post.status}`)
  console.log(`    Category: ${report.post.categoryCreated}`)
  console.log(`    Tags: ${report.post.tagsCreated.join(', ')}`)

  console.log(`\n  TIMING:`)
  console.log(`    Total: ${report.timing.totalSeconds}s`)
  console.log(`    Scraping: ${report.timing.scrapeSeconds}s | Analyze: ${report.timing.analyzeSeconds}s`)
  console.log(`    Write: ${report.timing.writeSeconds}s | Edit: ${report.timing.editSeconds}s`)
  console.log(`    Upload: ${report.timing.uploadSeconds}s`)
}

/**
 * Build a search query for Unsplash based on service type and keyword.
 * Instead of searching for airports, we search for tile/design imagery.
 */
function buildImageSearchQuery(serviceType: string, keyword: string): string {
  const serviceQueries: Record<string, string> = {
    bathroom: 'bathroom tile installation modern design',
    shower: 'shower tile design walk-in marble',
    floor: 'floor tile installation hardwood porcelain',
    backsplash: 'kitchen backsplash tile subway mosaic',
    repair: 'tile repair grout restoration',
    reglazing: 'bathtub reglazing tile refinishing',
    general: 'tile installation professional interior design',
  }

  // Use the service-specific base query, enhanced with keywords
  const baseQuery = serviceQueries[serviceType] || serviceQueries.general
  // Extract 1-2 relevant words from the keyword to add specificity
  const keywordWords = keyword.split(' ').filter(w =>
    !['the', 'a', 'an', 'in', 'for', 'of', 'to', 'and', 'or', 'how', 'what', 'best', 'top'].includes(w.toLowerCase())
  ).slice(0, 2).join(' ')

  return keywordWords ? `${baseQuery} ${keywordWords}` : baseQuery
}

const program = new Command()
  .name('aguirre-blog-engine')
  .description('Automated SEO blog content generator for Aguirre Modern Tile')
  .version('1.0.0')

// Generate command
program
  .command('generate')
  .description('Generate blog articles from the content queue')
  .option('-t, --type <type>', 'Article type filter: hub, pillar, spoke')
  .option('-s, --service <type>', 'Service type filter (e.g., bathroom, shower, floor)')
  .option('-n, --limit <number>', 'Max articles to generate', '1')
  .option('--dry-run', 'Preview what would be generated without creating posts')
  .action(async (options) => {
    try {
      console.log('\n--- Aguirre Blog Engine: Generate ---\n')

      const limit = parseInt(options.limit, 10)
      const items = await getNextQueuedItems(options.type, options.service, limit)

      if (items.length === 0) {
        console.log('No queued items found matching your filters.')
        return
      }

      console.log(`Found ${items.length} queued item(s)\n`)

      // Fetch all published slugs for internal link intelligence
      console.log('Fetching published posts for internal linking...')
      const publishedPosts = await getAllPublishedSlugs()
      console.log(`  ${publishedPosts.length} published post(s) available for linking\n`)

      // Get the API user for the author field
      const apiUser = await getApiUser()
      if (!apiUser) {
        console.error('Error: No API user found. Create a user in the CMS first.')
        process.exit(1)
      }

      for (const item of items) {
        console.log(`\n=== Processing: ${item.keyword} ===`)
        console.log(`  Type: ${item.articleType} | Service: ${item.serviceType} | Priority: ${item.priority}`)

        // Validate prerequisites
        const prereqError = await validatePrerequisites(item)
        if (prereqError) {
          console.log(`  Skipping -- ${prereqError}`)
          continue
        }

        if (options.dryRun) {
          console.log('  [DRY RUN] Would generate this article. Skipping.')
          continue
        }

        // Initialize report
        const report: ArticleReport = {
          timestamp: new Date().toISOString(),
          queueItemId: item.id,
          title: item.keyword,
          slug: item.slug,
          keyword: item.keyword,
          articleType: item.articleType,
          serviceType: item.serviceType,
          priority: item.priority,
          scraping: { searchedKeyword: item.keyword, urlsFound: 0, urlsScraped: 0, urlsFailed: 0, articles: [] },
          analysis: { commonTopics: [], contentGaps: [], recommendedH2s: [], faqQuestions: [], suggestedTags: [] },
          article: { htmlLength: 0, estimatedWordCount: 0, faqCount: 0, excerpt: '', metaTitle: '', metaDescription: '', suggestedCategory: '' },
          editing: { changesCount: 0, qualityScore: 0, changes: [] },
          infographics: { count: 0 },
          image: { found: false, filename: null, alt: null, mediaId: null },
          post: { postId: null, status: 'draft', categoryCreated: '', tagsCreated: [] },
          timing: { totalSeconds: 0, scrapeSeconds: 0, analyzeSeconds: 0, writeSeconds: 0, editSeconds: 0, uploadSeconds: 0 },
          seoScore: null,
          revision: null,
          error: null,
        }

        const totalStart = Date.now()

        try {
          // Mark as generating
          await markGenerating(item.id)

          // Scrape competitors
          const scrapeStart = Date.now()
          const manualUrls = item.competitorUrls?.map((c) => c.url) || []
          const competitors = await scrapeCompetitors(item.keyword, manualUrls)
          report.timing.scrapeSeconds = Math.round((Date.now() - scrapeStart) / 1000)

          // Populate scraping report
          report.scraping.urlsFound = competitors.length + (manualUrls.length > 0 ? 0 : 5 - competitors.length)
          report.scraping.urlsScraped = competitors.length
          report.scraping.urlsFailed = report.scraping.urlsFound - competitors.length
          report.scraping.articles = competitors.map((c: ScrapedArticle) => ({
            url: c.url,
            title: c.title,
            headingsFound: c.headings.length,
            status: 'success' as const,
          }))

          // Load verified tile service data (if available)
          const tileData = loadTileServiceData(item.serviceType)
          if (tileData) {
            console.log(`  Loaded verified data for ${item.serviceType} (verified ${tileData.lastVerified})`)
          } else {
            console.log(`  No verified data file for ${item.serviceType} -- Claude will use general knowledge`)
          }

          // Filter published posts to same service type (keep context focused)
          const servicePosts = publishedPosts.filter(p =>
            (p as unknown as Record<string, unknown>).serviceType === item.serviceType || !(p as unknown as Record<string, unknown>).serviceType
          )

          // Generate with Claude (3-prompt pipeline)
          resetTokenTracking()
          const result = await generateArticle(item, competitors, (step, data) => {
            // Callback to capture intermediate results for the report
            const r = data.result as Record<string, unknown>
            if (step === 'analyze') {
              report.timing.analyzeSeconds = Math.round(data.elapsed / 1000)
              report.analysis = {
                commonTopics: (r.commonTopics as string[]) || [],
                contentGaps: (r.gaps as string[]) || [],
                recommendedH2s: (r.recommendedH2s as string[]) || [],
                faqQuestions: (r.faqQuestions as string[]) || [],
                suggestedTags: (r.suggestedTags as string[]) || [],
              }
            } else if (step === 'write') {
              report.timing.writeSeconds = Math.round(data.elapsed / 1000)
            } else if (step === 'edit') {
              report.timing.editSeconds = Math.round(data.elapsed / 1000)
              report.editing = {
                changesCount: (r.changes as string[])?.length || 0,
                qualityScore: (r.qualityScore as number) || 0,
                changes: (r.changes as string[]) || [],
              }
            }
          }, tileData || undefined, servicePosts)

          // Capture revision metadata
          if (result.revision) {
            report.revision = result.revision
          }

          // Resolve title: AI-generated > spreadsheet > keyword
          const resolvedTitle = result.title || item.keyword
          report.title = resolvedTitle

          // Article stats
          report.article = {
            htmlLength: result.html.length,
            estimatedWordCount: Math.round(result.html.replace(/<[^>]+>/g, ' ').split(/\s+/).length),
            faqCount: result.faqItems.length,
            excerpt: result.excerpt,
            metaTitle: result.metaTitle,
            metaDescription: result.metaDescription,
            suggestedCategory: result.suggestedCategory,
          }

          // Use SEO score from generateArticle (already scored during write/edit flow)
          const seoScore = result.seoScore
          report.seoScore = seoScore
          if (result.editSkipped) {
            console.log(`  Edit skipped (score ${seoScore.total}/${seoScore.maxTotal} above threshold)`)
          }

          // Generate infographics (Claude SVG -> resvg PNG -> Payload upload)
          let contentHtml = result.html
          if (tileData) {
            try {
              console.log('  Generating infographics...')
              setCurrentStep('infographics')
              const infResult = await generateInfographics(contentHtml, tileData, item.serviceType)
              contentHtml = infResult.html
              report.infographics.count = infResult.count
              if (infResult.count > 0) {
                console.log(`  ${infResult.count} infographic(s) generated`)
              } else {
                console.log('  No infographics generated')
              }
            } catch (err) {
              console.log(`  Infographic generation failed: ${err instanceof Error ? err.message : err} -- continuing without`)
            }
          }

          // Strip any FAQ section from HTML body (FAQs are rendered separately via FaqAccordion)
          contentHtml = stripFaqSection(contentHtml)

          // Convert HTML to Lexical
          console.log('  Converting to Lexical format...')
          const lexicalContent = htmlToLexical(contentHtml)

          // Upload featured image (with cluster deduplication)
          const uploadStart = Date.now()
          let featuredImageId: string | null = null
          console.log('  Fetching featured image...')
          let usedPhotoIds: string[] = []
          try {
            usedPhotoIds = await getClusterUsedPhotoIds(item.serviceType)
            if (usedPhotoIds.length > 0) {
              console.log(`    Excluding ${usedPhotoIds.length} photo(s) already used in ${item.serviceType} cluster`)
            }
          } catch { /* cluster dedup is optional */ }

          // Search for tile/design photos based on service type and keyword
          const imageQuery = buildImageSearchQuery(item.serviceType, item.keyword)
          const photo = await getUnsplashPhoto(imageQuery, usedPhotoIds)
          if (photo) {
            const media = await uploadMedia(photo.buffer, photo.filename, photo.alt)
            featuredImageId = media.doc?.id || media.id
            report.image = { found: true, filename: photo.filename, alt: photo.alt, mediaId: featuredImageId }
            console.log(`  Image uploaded: ${photo.filename}`)
          } else {
            console.log('  No image found -- post will be created without featured image')
          }
          report.timing.uploadSeconds = Math.round((Date.now() - uploadStart) / 1000)

          // Re-score the image check now that we know if image was uploaded
          if (report.seoScore) {
            const imgScore = scoreArticle({
              html: result.html,
              keyword: item.keyword,
              slug: item.slug,
              metaTitle: result.metaTitle,
              metaDescription: result.metaDescription,
              excerpt: result.excerpt,
              faqItems: result.faqItems,
              articleType: item.articleType as 'hub' | 'pillar' | 'spoke',
              targetWords: item.targetWords || (item.articleType === 'hub' ? 2500 : item.articleType === 'pillar' ? 1500 : 1000),
              hasImage: report.image.found,
              imageAlt: report.image.alt,
              serviceType: item.serviceType,
              parentSlug: item.parentSlug,
              hubSlug: item.hubSlug,
            })
            report.seoScore = imgScore
          }

          // Find or create category and tags
          const category = await findOrCreateCategory(result.suggestedCategory)
          report.post.categoryCreated = result.suggestedCategory
          const tagIds: string[] = []
          for (const tagName of result.suggestedTags) {
            const tag = await findOrCreateTag(tagName)
            tagIds.push(tag.doc?.id || tag.id)
            report.post.tagsCreated.push(tagName)
          }

          // Check if a post with this slug already exists (re-generation)
          const existingPost = await findPostBySlug(item.slug)

          const postStatus = 'published'
          const postData: Record<string, unknown> = {
            title: resolvedTitle,
            slug: item.slug,
            excerpt: result.excerpt,
            content: lexicalContent,
            category: category.doc?.id || category.id,
            tags: tagIds,
            author: apiUser.id,
            status: postStatus,
            publishedAt: new Date().toISOString(),
            serviceType: item.serviceType,
            articleType: item.articleType,
            parentSlug: item.parentSlug || undefined,
            hubSlug: item.hubSlug || undefined,
            faqItems: result.faqItems,
            seo: {
              metaTitle: result.metaTitle,
              metaDescription: result.metaDescription,
            },
          }

          if (featuredImageId) {
            postData.featuredImage = featuredImageId
          }

          // Include SEO score in post data
          if (report.seoScore) {
            postData.seoScore = Math.min(report.seoScore.total, 100)
            postData.seoScoreDetails = report.seoScore
          }

          let postId: string
          if (existingPost) {
            // Update existing post instead of creating a duplicate
            console.log(`  Updating existing post (ID:${existingPost.id}) with regenerated content...`)
            await updatePost(existingPost.id, postData)
            postId = existingPost.id
          } else {
            console.log(`  Creating ${postStatus} post in CMS...`)
            const post = await createPost(postData)
            postId = post.doc?.id || post.id
          }
          report.post.postId = postId

          // Update queue item status to match the post
          await updateQueueItem(item.id, { status: 'published', generatedPost: postId })

          report.timing.totalSeconds = Math.round((Date.now() - totalStart) / 1000)

          // Token cost summary
          const tokenSummary = getTokenSummary()
          report.tokenUsage = {
            totalInput: tokenSummary.totalInput,
            totalOutput: tokenSummary.totalOutput,
            totalCacheRead: tokenSummary.totalCacheRead,
            totalCacheWrite: tokenSummary.totalCacheWrite,
            totalCost: Math.round(tokenSummary.totalCost * 10000) / 10000,
            steps: tokenSummary.steps.map(s => ({ step: s.step, input: s.inputTokens, output: s.outputTokens, cost: Math.round(s.cost * 10000) / 10000 })),
          }
          console.log(`\n  Total API cost: $${tokenSummary.totalCost.toFixed(4)} (${tokenSummary.totalInput.toLocaleString()} in / ${tokenSummary.totalOutput.toLocaleString()} out)`)
          for (const s of tokenSummary.steps) {
            console.log(`     ${s.step}: $${s.cost.toFixed(4)} (${s.inputTokens.toLocaleString()} in / ${s.outputTokens.toLocaleString()} out)`)
          }

          console.log(`\n  Done! SEO Score: ${report.seoScore?.total}/${report.seoScore?.maxTotal} (${report.seoScore?.grade})`)
          console.log(`  Review at: CMS Admin -> Posts -> "${resolvedTitle}"`)

          // Print reports
          printReport(report)
          if (report.seoScore) printSeoScore(report.seoScore)
          const reportPath = saveReport(report)
          console.log(`\n  Report saved: ${reportPath}`)
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          console.error(`  Error: ${errorMsg}`)
          report.error = errorMsg
          report.timing.totalSeconds = Math.round((Date.now() - totalStart) / 1000)
          await markError(item.id, errorMsg)

          // Save report even on error
          const reportPath = saveReport(report)
          console.log(`  Error report saved: ${reportPath}`)
        }
      }

      console.log('\n--- Generation complete! ---\n')
    } catch (err) {
      console.error('Fatal error:', err)
      process.exit(1)
    }
  })

// Report command
program
  .command('report')
  .description('Show content queue status report')
  .option('-s, --service <type>', 'Service type filter')
  .option('-b, --batch <batch>', 'Batch name filter')
  .action(async (options) => {
    try {
      console.log('\n--- Aguirre Blog Engine: Queue Report ---\n')

      const filters: Record<string, string> = {}
      if (options.service) {
        filters['where[serviceType][equals]'] = options.service.toLowerCase()
      }
      if (options.batch) {
        filters['where[batch][equals]'] = options.batch
      }

      const result = await getQueueItems(filters)
      const items = result.docs as QueueItem[]

      if (items.length === 0) {
        console.log('Queue is empty.')
        return
      }

      // Group by status
      const byStatus: Record<string, QueueItem[]> = {}
      for (const item of items) {
        if (!byStatus[item.status]) byStatus[item.status] = []
        byStatus[item.status].push(item)
      }

      const statusOrder = ['queued', 'generating', 'draft', 'review', 'published', 'error']
      for (const status of statusOrder) {
        const group = byStatus[status]
        if (!group) continue

        console.log(`\n${status.toUpperCase()} (${group.length}):`)
        for (const item of group) {
          const batchTag = item.batch ? ` [${item.batch}]` : ''
          console.log(`  ${item.priority} | ${item.serviceType} | ${item.articleType.padEnd(11)} | ${item.keyword}${batchTag}`)
        }
      }

      console.log(`\nTotal: ${items.length} items`)

      // Show batch summary if filtering by batch
      if (options.batch) {
        const published = byStatus['published']?.length || 0
        const draft = byStatus['draft']?.length || 0
        const review = byStatus['review']?.length || 0
        const queued = byStatus['queued']?.length || 0
        const error = byStatus['error']?.length || 0
        console.log(`\nBatch "${options.batch}" summary:`)
        console.log(`  Queued: ${queued} | Draft: ${draft} | Review: ${review} | Published: ${published} | Error: ${error}`)
      }

      console.log('')
    } catch (err) {
      console.error('Error:', err)
      process.exit(1)
    }
  })

// Publish command
program
  .command('publish')
  .description('Publish articles by batch -- updates post status and queue item status')
  .requiredOption('-b, --batch <batch>', 'Batch name to publish')
  .option('--dry-run', 'Preview what would be published without making changes')
  .action(async (options) => {
    try {
      console.log('\n--- Aguirre Blog Engine: Batch Publish ---\n')
      console.log(`Batch: ${options.batch}${options.dryRun ? ' (DRY RUN)' : ''}\n`)

      // Fetch items in the batch with draft/review status
      const items = await getBatchItems(options.batch, ['draft', 'review'])

      if (items.length === 0) {
        console.log('No draft or review items found in this batch.')
        console.log('Items must have status "draft" or "review" to be published.')
        return
      }

      console.log(`Found ${items.length} article(s) to publish:\n`)

      let published = 0
      let failed = 0

      for (const item of items) {
        const postId = typeof item.generatedPost === 'string' ? item.generatedPost : null
        console.log(`  ${item.slug}`)
        console.log(`    Title: ${item.keyword}`)
        console.log(`    Status: ${item.status} -> published`)
        console.log(`    Post ID: ${postId || 'none'}`)

        if (options.dryRun) {
          console.log('    [DRY RUN] Would publish this article.\n')
          published++
          continue
        }

        try {
          // Update the linked post status to published
          if (postId) {
            await updatePost(postId, { status: 'published' })
          } else {
            console.log('    Warning: No linked post -- skipping post update')
          }

          // Update queue item status
          await markPublished(item.id)
          console.log('    Published\n')
          published++
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.log(`    Failed: ${msg}\n`)
          failed++
        }
      }

      console.log('--- Summary ---')
      console.log(`  Published: ${published}`)
      if (failed > 0) console.log(`  Failed: ${failed}`)
      console.log(`  Slugs: ${items.map((i) => i.slug).join(', ')}`)

      if (!options.dryRun && published > 0) {
        console.log('\n  Next steps:')
        console.log('  1. Submit updated sitemap via Google Search Console')
        console.log('  2. Monitor indexing over the next 24-48 hours')
        console.log('  3. Check Search Console for any crawl errors')
      }

      console.log('')
    } catch (err) {
      console.error('Error:', err)
      process.exit(1)
    }
  })

// Score command
program
  .command('score')
  .description('Run SEO scoring on existing posts in the CMS')
  .option('--slug <slug>', 'Score a specific post by slug')
  .option('-s, --service <type>', 'Score all posts for a service type')
  .option('--all', 'Score all posts')
  .option('--save', 'Update the seoScore field in the CMS')
  .action(async (options) => {
    try {
      console.log('\n--- Aguirre Blog Engine: SEO Scorer ---\n')

      // Build query filters
      const params = new URLSearchParams({ limit: '100' })
      if (options.slug) {
        params.set('where[slug][equals]', options.slug)
      } else if (options.service) {
        params.set('where[serviceType][equals]', options.service.toLowerCase())
      } else if (!options.all) {
        console.log('Usage: score --slug <slug> | --service <type> | --all')
        console.log('  Add --save to update the seoScore field in the CMS')
        return
      }

      // Fetch posts directly
      const postsUrl = `${env.PAYLOAD_CMS_URL}/api/posts?${params.toString()}`
      const postsRes = await fetch(postsUrl, {
        headers: { Authorization: `users API-Key ${env.PAYLOAD_API_KEY}` },
      })
      const postsData = await postsRes.json()
      const posts = postsData.docs || []

      if (posts.length === 0) {
        console.log('No posts found matching your filters.')
        return
      }

      console.log(`Found ${posts.length} post(s) to score\n`)

      // Fetch queue items for keyword lookup
      const queueRes = await getQueueItems({ limit: '200' })
      const queueItems = (queueRes.docs || []) as QueueItem[]
      const queueBySlug = new Map(queueItems.map((q) => [q.slug, q]))

      const results: { slug: string; title: string; score: number; grade: string }[] = []

      for (const post of posts) {
        console.log(`=== ${post.title} ===`)

        // Convert Lexical content back to HTML
        const html = post.content ? lexicalToHtml(post.content) : ''
        if (!html) {
          console.log('  Warning: No content to score\n')
          continue
        }

        // Look up keyword from queue item
        const queueItem = queueBySlug.get(post.slug)
        const keyword = queueItem?.keyword || post.slug.replace(/-/g, ' ')

        // Determine target words based on article type
        const articleType = post.articleType || 'spoke'
        const targetWords = queueItem?.targetWords
          || (articleType === 'hub' ? 2500 : articleType === 'pillar' ? 1500 : 1000)

        // Check for featured image
        const hasImage = !!post.featuredImage
        const imageAlt = typeof post.featuredImage === 'object' ? post.featuredImage?.alt : null

        const score = scoreArticle({
          html,
          keyword,
          slug: post.slug,
          metaTitle: post.seo?.metaTitle || post.title || '',
          metaDescription: post.seo?.metaDescription || post.excerpt || '',
          excerpt: post.excerpt || '',
          faqItems: post.faqItems || [],
          articleType: articleType as 'hub' | 'pillar' | 'spoke',
          targetWords,
          hasImage,
          imageAlt,
          serviceType: post.serviceType || undefined,
          parentSlug: post.parentSlug || undefined,
          hubSlug: post.hubSlug || undefined,
        })

        printSeoScore(score)
        results.push({ slug: post.slug, title: post.title, score: score.total, grade: score.grade })

        // Optionally save score to CMS
        if (options.save) {
          try {
            await updatePost(post.id, { seoScore: score.total, seoScoreDetails: score })
            console.log(`\n  Score saved to CMS: ${score.total}/100`)
          } catch (err) {
            console.log(`\n  Failed to save score: ${err instanceof Error ? err.message : err}`)
          }
        }

        console.log('')
      }

      // Summary table for multiple posts
      if (results.length > 1) {
        console.log('\n  +---------------------------------------------------------+')
        console.log('  |              SCORE SUMMARY                               |')
        console.log('  +---------------------------------------------------------+')
        for (const r of results) {
          console.log(`  ${r.grade.padEnd(3)} ${String(r.score).padStart(3)}/100  ${r.title.slice(0, 60)}`)
        }
        const avg = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
        console.log(`\n  Average: ${avg}/100`)
      }

      console.log('')
    } catch (err) {
      console.error('Error:', err)
      process.exit(1)
    }
  })

program.parse()
