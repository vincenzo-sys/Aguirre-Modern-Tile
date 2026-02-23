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
    title: `Floor Tile Installation in ${locationName}, MA | Aguirre Modern Tile`,
    description: `Professional floor tile installation in ${locationName}, Massachusetts. Ceramic, porcelain, natural stone, and large format tile floors. Free estimates. Call (617) 766-1259.`,
    openGraph: {
      title: `Floor Tile Installation in ${locationName}, MA | Aguirre Modern Tile`,
      description: `Professional floor tile installation in ${locationName}, Massachusetts. Ceramic, porcelain, natural stone, and large format tile floors.`,
    },
  }
}

export default async function FloorTileLocationPage({ params }: Props) {
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
      serviceType="floortileinstallation"
      serviceTitle="Floor Tile Installation"
    />
  )
}
