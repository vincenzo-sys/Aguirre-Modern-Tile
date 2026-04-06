import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '..', 'data', 'tile-services')

export interface TileServiceData {
  serviceType: string
  displayName: string
  lastVerified: string
  overview: {
    description: string
    avgCostPerSqFt: { low: number; high: number }
    typicalProjectSize: string
    installationTime: string
    popularIn: string[] // e.g., ["bathrooms", "kitchens"]
  }
  materials: Array<{
    name: string
    type: string // porcelain, ceramic, natural-stone, glass, etc.
    avgCostPerSqFt: number
    durability: string
    bestFor: string[]
    maintenanceLevel: string
  }>
  techniques: Array<{
    name: string
    description: string
    bestFor: string[]
    difficultyLevel: string
  }>
  patterns: Array<{
    name: string  // herringbone, subway, chevron, etc.
    description: string
    popularWith: string[]
  }>
  localContext: {
    region: string // "Greater Boston, MA"
    climateConsiderations: string[]
    popularStyles: string[]
    avgLaborRate: { low: number; high: number }
  }
  brands: Array<{
    name: string
    specialty: string
    priceRange: string
  }>
  [key: string]: unknown // Allow dynamic access for additional fields
}

export function loadTileServiceData(serviceType: string): TileServiceData | null {
  const filepath = path.join(DATA_DIR, `${serviceType.toLowerCase()}.json`)
  if (!fs.existsSync(filepath)) {
    return null
  }

  const data: TileServiceData = JSON.parse(fs.readFileSync(filepath, 'utf-8'))

  // Warn if data is stale (>90 days old)
  const lastVerified = new Date(data.lastVerified)
  const daysSinceVerified = Math.floor((Date.now() - lastVerified.getTime()) / (1000 * 60 * 60 * 24))
  if (daysSinceVerified > 90) {
    console.warn(
      `  Warning: ${serviceType}.json last verified ${data.lastVerified} (${daysSinceVerified} days ago) — consider updating pricing before generating.`
    )
  }

  return data
}

/**
 * Get entity patterns for tile-industry fact checking.
 * Returns regex patterns for material names, brand names, techniques, and patterns
 * that can be used to verify the article references real entities.
 */
export function getEntityPatterns(data: TileServiceData): RegExp[] {
  const patterns: RegExp[] = []

  // Material name patterns
  for (const m of data.materials) {
    const escaped = m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    patterns.push(new RegExp(escaped, 'i'))
  }

  // Material type patterns (combine into one alternation)
  const materialTypes = data.materials.map((m) => m.type)
  const uniqueTypes = Array.from(new Set(materialTypes))
  if (uniqueTypes.length > 0) {
    const escaped = uniqueTypes.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    patterns.push(new RegExp(`(${escaped.join('|')})`, 'i'))
  }

  // Technique patterns
  if (data.techniques.length > 0) {
    const escaped = data.techniques.map((t) => t.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    patterns.push(new RegExp(`(${escaped.join('|')})`, 'i'))
  }

  // Pattern/layout patterns (herringbone, subway, etc.)
  if (data.patterns.length > 0) {
    const escaped = data.patterns.map((p) => p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    patterns.push(new RegExp(`(${escaped.join('|')})`, 'i'))
  }

  // Brand patterns
  if (data.brands.length > 0) {
    const escaped = data.brands.map((b) => b.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    patterns.push(new RegExp(`(${escaped.join('|')})`, 'i'))
  }

  // Local context patterns
  if (data.localContext.region) {
    patterns.push(new RegExp(data.localContext.region.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
  }

  return patterns
}
