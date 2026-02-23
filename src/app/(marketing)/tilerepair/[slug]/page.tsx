import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import LocationPage from '@/components/LocationPage'
import { locationSlugs, parseLocationSlug, slugToName } from '@/data/locations'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return locationSlugs.map((slug) => ({
    slug,
  }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params

  if (!locationSlugs.includes(slug)) {
    return {}
  }

  const location = parseLocationSlug(slug)
  const locationName = location.neighborhood
    ? `${location.neighborhood}, ${location.city}`
    : location.city

  return {
    title: `Tile Repair in ${locationName}, MA | Aguirre Modern Tile`,
    description: `Professional tile repair services in ${locationName}, Massachusetts. Fix cracked, chipped, or loose tiles. Grout repair and regrouting. Free estimates. Call (617) 766-1259.`,
    openGraph: {
      title: `Tile Repair in ${locationName}, MA | Aguirre Modern Tile`,
      description: `Professional tile repair services in ${locationName}, Massachusetts. Fix cracked, chipped, or loose tiles. Grout repair and regrouting.`,
    },
  }
}

export default async function TileRepairLocationPage({ params }: Props) {
  const { slug } = await params

  if (!locationSlugs.includes(slug)) {
    notFound()
  }

  const location = parseLocationSlug(slug)

  return (
    <LocationPage
      city={location.city}
      neighborhood={location.neighborhood}
      state={location.state}
      serviceType="tilerepair"
      serviceTitle="Tile Repair"
    />
  )
}
