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
    title: `Tile Contractor in ${locationName}, MA | Aguirre Modern Tile`,
    description: `Expert tile contractor serving ${locationName}, Massachusetts. Professional bathroom tile, shower tile, floor tile, and backsplash installation. Free estimates. Call (617) 766-1259.`,
    openGraph: {
      title: `Tile Contractor in ${locationName}, MA | Aguirre Modern Tile`,
      description: `Expert tile contractor serving ${locationName}, Massachusetts. Professional bathroom tile, shower tile, floor tile, and backsplash installation.`,
    },
  }
}

export default async function TileContractorLocationPage({ params }: Props) {
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
      serviceType="tilecontractor"
      serviceTitle="Tile Contractor"
    />
  )
}
