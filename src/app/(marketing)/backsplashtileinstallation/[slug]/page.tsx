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
    title: `Backsplash Tile Installation in ${locationName}, MA | Aguirre Modern Tile`,
    description: `Expert kitchen backsplash tile installation in ${locationName}, Massachusetts. Subway tile, mosaic, and custom backsplash designs. Free estimates. Call (617) 766-1259.`,
    openGraph: {
      title: `Backsplash Tile Installation in ${locationName}, MA | Aguirre Modern Tile`,
      description: `Expert kitchen backsplash tile installation in ${locationName}, Massachusetts. Subway tile, mosaic, and custom backsplash designs.`,
    },
  }
}

export default async function BacksplashTileLocationPage({ params }: Props) {
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
      serviceType="backsplashtileinstallation"
      serviceTitle="Backsplash Tile Installation"
    />
  )
}
