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
    title: `Tile Reglazing in ${locationName}, MA | Aguirre Modern Tile`,
    description: `Professional tile reglazing and refinishing in ${locationName}, Massachusetts. Restore your bathtub, shower, and tile surfaces. Free estimates. Call (617) 766-1259.`,
    openGraph: {
      title: `Tile Reglazing in ${locationName}, MA | Aguirre Modern Tile`,
      description: `Professional tile reglazing and refinishing in ${locationName}, Massachusetts. Restore your bathtub, shower, and tile surfaces.`,
    },
  }
}

export default async function TileReglazingLocationPage({ params }: Props) {
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
      serviceType="tilereglazing"
      serviceTitle="Tile Reglazing"
    />
  )
}
