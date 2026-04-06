import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LINKS_PATH = path.resolve(__dirname, '..', 'data', 'external-links.json')

export interface ExternalLink {
  id: string
  url: string
  domain: string
  title: string
  description: string
  anchorTextSuggestions: string[]
  category: string
  subcategory: string
  linkType: string
  authority: 'high' | 'medium' | 'low'
  trustSignals: string[]
  relevantServiceTypes: string[]
  relevantTopics: string[]
  relevantArticleTypes: string[]
  rel: 'dofollow' | 'nofollow' | 'sponsored'
  contextualUsage: string
  pageType: string
  lastVerified: string
  status: string
}

interface ExternalLinksDB {
  _metadata: Record<string, unknown>
  links: ExternalLink[]
  _usageGuidelines: Record<string, unknown>
}

let _cache: ExternalLinksDB | null = null

function loadDB(): ExternalLinksDB {
  if (_cache) return _cache
  if (!fs.existsSync(LINKS_PATH)) {
    console.warn(`  Warning: External links DB not found at ${LINKS_PATH} -- using default tile industry links`)
    _cache = { _metadata: {}, links: getDefaultLinks(), _usageGuidelines: {} }
    return _cache
  }
  const data = JSON.parse(fs.readFileSync(LINKS_PATH, 'utf-8')) as ExternalLinksDB
  _cache = data
  return data
}

/**
 * Default set of approved external links for tile industry content.
 * Used when external-links.json does not exist.
 */
function getDefaultLinks(): ExternalLink[] {
  return [
    // HIGH AUTHORITY -- Industry standards and organizations
    {
      id: 'tcna-handbook',
      url: 'https://www.tcnatile.com/tile-information.html',
      domain: 'tcnatile.com',
      title: 'TCNA Tile Information',
      description: 'Tile Council of North America -- industry standards and installation guidelines',
      anchorTextSuggestions: ['TCNA installation standards', 'Tile Council of North America guidelines'],
      category: 'industry-standards',
      subcategory: 'installation',
      linkType: 'resource',
      authority: 'high',
      trustSignals: ['industry-body', 'standards-org'],
      relevantServiceTypes: ['all'],
      relevantTopics: ['installation', 'standards', 'materials'],
      relevantArticleTypes: ['hub', 'sub-pillar', 'spoke'],
      rel: 'dofollow',
      contextualUsage: 'When discussing installation standards, material ratings, or industry best practices',
      pageType: 'resource-hub',
      lastVerified: '2026-04-01',
      status: 'active',
    },
    {
      id: 'ntca-methods',
      url: 'https://www.tile-assn.com/default.aspx',
      domain: 'tile-assn.com',
      title: 'National Tile Contractors Association',
      description: 'NTCA -- professional tile contractor organization with installation methods and training',
      anchorTextSuggestions: ['NTCA certified methods', 'National Tile Contractors Association'],
      category: 'industry-standards',
      subcategory: 'contractors',
      linkType: 'resource',
      authority: 'high',
      trustSignals: ['industry-body', 'certification-org'],
      relevantServiceTypes: ['all'],
      relevantTopics: ['installation', 'contractor-selection', 'certification'],
      relevantArticleTypes: ['hub', 'sub-pillar', 'spoke'],
      rel: 'dofollow',
      contextualUsage: 'When discussing professional installation, contractor qualifications, or certification',
      pageType: 'organization-home',
      lastVerified: '2026-04-01',
      status: 'active',
    },
    {
      id: 'schluter-systems',
      url: 'https://www.schluter.com/schluter-us/en_US/',
      domain: 'schluter.com',
      title: 'Schluter Systems',
      description: 'Leading manufacturer of tile installation systems -- waterproofing, uncoupling, edge profiles',
      anchorTextSuggestions: ['Schluter waterproofing system', 'Schluter DITRA membrane'],
      category: 'manufacturers',
      subcategory: 'installation-systems',
      linkType: 'resource',
      authority: 'high',
      trustSignals: ['manufacturer', 'industry-leader'],
      relevantServiceTypes: ['bathroom', 'shower', 'floor'],
      relevantTopics: ['waterproofing', 'underlayment', 'shower-systems', 'edge-profiles'],
      relevantArticleTypes: ['hub', 'sub-pillar', 'spoke'],
      rel: 'dofollow',
      contextualUsage: 'When discussing waterproofing, shower pan systems, uncoupling membranes, or edge trim',
      pageType: 'manufacturer-home',
      lastVerified: '2026-04-01',
      status: 'active',
    },
    {
      id: 'ansi-standards',
      url: 'https://www.tcnatile.com/tile-standards.html',
      domain: 'tcnatile.com',
      title: 'ANSI Tile Standards',
      description: 'American National Standards Institute tile standards via TCNA',
      anchorTextSuggestions: ['ANSI tile standards', 'ANSI A108/A118 standards'],
      category: 'industry-standards',
      subcategory: 'specifications',
      linkType: 'resource',
      authority: 'high',
      trustSignals: ['standards-org', 'ANSI-referenced'],
      relevantServiceTypes: ['all'],
      relevantTopics: ['standards', 'specifications', 'material-testing'],
      relevantArticleTypes: ['hub', 'sub-pillar'],
      rel: 'dofollow',
      contextualUsage: 'When referencing specific tile standards, PEI ratings, water absorption rates, or slip resistance',
      pageType: 'standards-page',
      lastVerified: '2026-04-01',
      status: 'active',
    },
    // MEDIUM AUTHORITY -- Trusted home improvement and design sources
    {
      id: 'houzz-tile',
      url: 'https://www.houzz.com/photos/tile',
      domain: 'houzz.com',
      title: 'Houzz Tile Ideas and Photos',
      description: 'Design inspiration and professional photos of tile installations',
      anchorTextSuggestions: ['tile design inspiration on Houzz', 'popular tile designs'],
      category: 'design-inspiration',
      subcategory: 'photos',
      linkType: 'inspiration',
      authority: 'medium',
      trustSignals: ['high-DA', 'design-authority'],
      relevantServiceTypes: ['all'],
      relevantTopics: ['design', 'trends', 'inspiration', 'patterns'],
      relevantArticleTypes: ['hub', 'sub-pillar', 'spoke'],
      rel: 'dofollow',
      contextualUsage: 'When discussing design trends, visual inspiration, or popular tile styles',
      pageType: 'gallery',
      lastVerified: '2026-04-01',
      status: 'active',
    },
    {
      id: 'toh-tile-install',
      url: 'https://www.thisoldhouse.com/tile',
      domain: 'thisoldhouse.com',
      title: 'This Old House -- Tile',
      description: 'Expert tile installation guides and tips from This Old House',
      anchorTextSuggestions: ['This Old House tile guide', 'expert tile installation tips'],
      category: 'how-to',
      subcategory: 'installation-guides',
      linkType: 'resource',
      authority: 'medium',
      trustSignals: ['high-DA', 'editorial-authority', 'trusted-brand'],
      relevantServiceTypes: ['all'],
      relevantTopics: ['installation', 'how-to', 'DIY-vs-pro', 'maintenance'],
      relevantArticleTypes: ['hub', 'sub-pillar', 'spoke'],
      rel: 'dofollow',
      contextualUsage: 'When discussing installation techniques, maintenance tips, or DIY vs professional',
      pageType: 'category-hub',
      lastVerified: '2026-04-01',
      status: 'active',
    },
    {
      id: 'hd-tile-guide',
      url: 'https://www.homedepot.com/c/ab/types-of-tile/9ba683603be9fa5395fab90a26fa4e',
      domain: 'homedepot.com',
      title: 'Home Depot -- Types of Tile Guide',
      description: 'Comprehensive guide to tile types, materials, and selection criteria',
      anchorTextSuggestions: ['tile material comparison guide', 'types of tile overview'],
      category: 'buying-guides',
      subcategory: 'materials',
      linkType: 'resource',
      authority: 'medium',
      trustSignals: ['high-DA', 'trusted-retailer'],
      relevantServiceTypes: ['all'],
      relevantTopics: ['materials', 'tile-types', 'buying-guide', 'cost'],
      relevantArticleTypes: ['hub', 'sub-pillar', 'spoke'],
      rel: 'dofollow',
      contextualUsage: 'When comparing tile materials, discussing cost ranges, or helping readers choose tile types',
      pageType: 'buying-guide',
      lastVerified: '2026-04-01',
      status: 'active',
    },
    {
      id: 'ad-tile-trends',
      url: 'https://www.architecturaldigest.com/gallery/tile-trends',
      domain: 'architecturaldigest.com',
      title: 'Architectural Digest -- Tile Trends',
      description: 'Current and emerging tile design trends from Architectural Digest',
      anchorTextSuggestions: ['current tile trends', 'tile design trends from Architectural Digest'],
      category: 'design-inspiration',
      subcategory: 'trends',
      linkType: 'editorial',
      authority: 'medium',
      trustSignals: ['high-DA', 'editorial-authority', 'design-publication'],
      relevantServiceTypes: ['bathroom', 'backsplash', 'floor', 'shower'],
      relevantTopics: ['trends', 'design', 'luxury', 'patterns'],
      relevantArticleTypes: ['hub', 'sub-pillar'],
      rel: 'dofollow',
      contextualUsage: 'When discussing current design trends, luxury tile options, or pattern innovations',
      pageType: 'gallery-editorial',
      lastVerified: '2026-04-01',
      status: 'active',
    },
    {
      id: 'nkba-guidelines',
      url: 'https://nkba.org/',
      domain: 'nkba.org',
      title: 'National Kitchen & Bath Association',
      description: 'NKBA -- industry guidelines for kitchen and bathroom design',
      anchorTextSuggestions: ['NKBA design guidelines', 'kitchen and bath industry standards'],
      category: 'industry-standards',
      subcategory: 'design-guidelines',
      linkType: 'resource',
      authority: 'medium',
      trustSignals: ['industry-body', 'design-authority'],
      relevantServiceTypes: ['bathroom', 'shower', 'backsplash'],
      relevantTopics: ['design', 'kitchen', 'bathroom', 'remodeling'],
      relevantArticleTypes: ['hub', 'sub-pillar'],
      rel: 'dofollow',
      contextualUsage: 'When discussing bathroom or kitchen remodel standards, layout planning, or design guidelines',
      pageType: 'organization-home',
      lastVerified: '2026-04-01',
      status: 'active',
    },
    // LOW AUTHORITY -- Manufacturer blogs and product-specific sources
    {
      id: 'daltile-products',
      url: 'https://www.daltile.com/',
      domain: 'daltile.com',
      title: 'Daltile',
      description: 'Major tile manufacturer -- porcelain, ceramic, natural stone products',
      anchorTextSuggestions: ['Daltile porcelain collection', 'Daltile product line'],
      category: 'manufacturers',
      subcategory: 'tile-products',
      linkType: 'product',
      authority: 'low',
      trustSignals: ['manufacturer', 'major-brand'],
      relevantServiceTypes: ['all'],
      relevantTopics: ['materials', 'porcelain', 'ceramic', 'products'],
      relevantArticleTypes: ['sub-pillar', 'spoke'],
      rel: 'dofollow',
      contextualUsage: 'When mentioning specific product lines or manufacturer recommendations',
      pageType: 'manufacturer-home',
      lastVerified: '2026-04-01',
      status: 'active',
    },
    {
      id: 'porcelanosa-products',
      url: 'https://www.porcelanosa.com/usa/',
      domain: 'porcelanosa.com',
      title: 'Porcelanosa USA',
      description: 'Premium tile and surface manufacturer -- high-end porcelain and ceramic',
      anchorTextSuggestions: ['Porcelanosa premium tiles', 'Porcelanosa collection'],
      category: 'manufacturers',
      subcategory: 'premium-tile',
      linkType: 'product',
      authority: 'low',
      trustSignals: ['manufacturer', 'premium-brand'],
      relevantServiceTypes: ['bathroom', 'floor', 'backsplash', 'shower'],
      relevantTopics: ['luxury', 'premium-materials', 'porcelain', 'large-format'],
      relevantArticleTypes: ['sub-pillar', 'spoke'],
      rel: 'dofollow',
      contextualUsage: 'When discussing premium or luxury tile options, large-format tiles, or European brands',
      pageType: 'manufacturer-home',
      lastVerified: '2026-04-01',
      status: 'active',
    },
    {
      id: 'mapei-products',
      url: 'https://www.mapei.com/us/en',
      domain: 'mapei.com',
      title: 'MAPEI',
      description: 'Leading adhesive and grout manufacturer for tile installation',
      anchorTextSuggestions: ['MAPEI thin-set mortar', 'MAPEI grout products'],
      category: 'manufacturers',
      subcategory: 'installation-materials',
      linkType: 'product',
      authority: 'low',
      trustSignals: ['manufacturer', 'industry-leader'],
      relevantServiceTypes: ['all'],
      relevantTopics: ['grout', 'mortar', 'adhesives', 'installation-materials'],
      relevantArticleTypes: ['sub-pillar', 'spoke'],
      rel: 'dofollow',
      contextualUsage: 'When discussing grout types, thin-set mortar, or installation material selection',
      pageType: 'manufacturer-home',
      lastVerified: '2026-04-01',
      status: 'active',
    },
    {
      id: 'laticrete-products',
      url: 'https://laticrete.com/',
      domain: 'laticrete.com',
      title: 'LATICRETE',
      description: 'Tile and stone installation systems -- adhesives, grouts, waterproofing',
      anchorTextSuggestions: ['LATICRETE installation products', 'LATICRETE waterproofing'],
      category: 'manufacturers',
      subcategory: 'installation-materials',
      linkType: 'product',
      authority: 'low',
      trustSignals: ['manufacturer', 'installer-preferred'],
      relevantServiceTypes: ['all'],
      relevantTopics: ['waterproofing', 'adhesives', 'grout', 'installation-systems'],
      relevantArticleTypes: ['sub-pillar', 'spoke'],
      rel: 'dofollow',
      contextualUsage: 'When discussing professional-grade installation materials or waterproofing systems',
      pageType: 'manufacturer-home',
      lastVerified: '2026-04-01',
      status: 'active',
    },
  ]
}

/**
 * Get external links filtered by service type and article type.
 * Returns only active links relevant to the given service type and article type.
 */
export function getExternalLinks(
  serviceType: string,
  articleType: string
): ExternalLink[] {
  const db = loadDB()
  const service = serviceType.toLowerCase()

  return db.links.filter((link) => {
    if (link.status !== 'active' && link.status !== 'cloudflare-blocked') return false
    const serviceMatch = link.relevantServiceTypes.includes(service) || link.relevantServiceTypes.includes('all')
    const typeMatch = link.relevantArticleTypes.includes(articleType)
    return serviceMatch && typeMatch
  })
}

/**
 * Get all approved domains for a service type (from external-links.json + tileData).
 * Returns a Set of domain strings (without www. prefix) for efficient lookup.
 */
export function getApprovedDomains(serviceType: string): Set<string> {
  const domains = new Set<string>()
  const db = loadDB()
  const service = serviceType.toLowerCase()

  // Add domains from external links DB
  for (const link of db.links) {
    if (link.status !== 'active' && link.status !== 'cloudflare-blocked') continue
    const serviceMatch = link.relevantServiceTypes.includes(service) || link.relevantServiceTypes.includes('all')
    if (serviceMatch) {
      domains.add(link.domain.replace(/^www\./, ''))
    }
  }

  // Also try loading tile service data for additional trusted domains
  try {
    const dataPath = path.resolve(__dirname, '..', 'data', 'tile-services', `${service}.json`)
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
      if (data.trustedSources) {
        for (const [, value] of Object.entries(data.trustedSources)) {
          if (typeof value === 'string') continue
          if (value && typeof value === 'object') {
            for (const url of Object.values(value as Record<string, string>)) {
              try {
                domains.add(new URL(url).hostname.replace(/^www\./, ''))
              } catch { /* skip malformed URLs */ }
            }
          }
        }
      }
    }
  } catch { /* tile service data not available */ }

  return domains
}

/**
 * Cap and sort links by authority (high first), limiting total count.
 */
function capLinks(links: ExternalLink[], max: number): ExternalLink[] {
  const sorted = [...links].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 }
    return (order[a.authority] ?? 2) - (order[b.authority] ?? 2)
  })
  return sorted.slice(0, max)
}

/**
 * Format external links into a prompt-ready string for the AI writer.
 * Groups by authority level and includes anchor text + usage guidance.
 * Capped at 15 links to reduce token costs.
 */
export function formatExternalLinksForPrompt(
  links: ExternalLink[],
  articleType: string
): string {
  if (links.length === 0) return ''

  const densityGuide: Record<string, string> = {
    hub: '6-10 external links',
    'sub-pillar': '4-7 external links',
    spoke: '2-4 external links',
  }

  const capped = capLinks(links, 15)
  const high = capped.filter((l) => l.authority === 'high')
  const medium = capped.filter((l) => l.authority === 'medium')
  const low = capped.filter((l) => l.authority === 'low')

  let output = `**EXTERNAL LINKS DATABASE -- use these verified links in the article:**
Target: ${densityGuide[articleType] || '4-7 external links'}. At least 50% should be high-authority. Use 4+ unique domains.
Never use "click here" as anchor text. Never put external links in CTAs (CTAs link to Aguirre Modern Tile only).
Place links naturally within body paragraphs. Front-load high-authority links in the first half.\n\n`

  const formatLink = (l: ExternalLink) => {
    const rel = l.rel === 'nofollow' ? ' rel="nofollow"' : ''
    const anchors = l.anchorTextSuggestions.slice(0, 2).join('" or "')
    return `- [${l.authority.toUpperCase()}] ${l.url}${rel}
  Anchors: "${anchors}"
  When: ${l.contextualUsage}`
  }

  if (high.length > 0) {
    output += `HIGH AUTHORITY (prefer these):\n${high.map(formatLink).join('\n')}\n\n`
  }
  if (medium.length > 0) {
    output += `MEDIUM AUTHORITY:\n${medium.map(formatLink).join('\n')}\n\n`
  }
  if (low.length > 0) {
    output += `LOW AUTHORITY (use sparingly):\n${low.map(formatLink).join('\n')}\n\n`
  }

  return output
}

/**
 * Compact format for the editor -- just URLs and rel attributes.
 * The editor only needs to verify links exist, not choose them.
 */
export function formatExternalLinksForEditor(
  links: ExternalLink[]
): string {
  if (links.length === 0) return ''

  let output = '\n**Approved external link URLs (verify article links are in this list):**\n'
  for (const l of links) {
    const rel = l.rel === 'nofollow' ? ' rel="nofollow"' : ''
    output += `- ${l.url}${rel}\n`
  }
  output += 'Remove any external links NOT in this list.\n'
  return output
}
