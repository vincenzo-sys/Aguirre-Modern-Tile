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
    title: `Shower Tile Installation in ${locationName}, MA | Aguirre Modern Tile`,
    description: `Expert shower tile installation in ${locationName}, Massachusetts. Custom shower tile designs, waterproofing, and professional installation. Free estimates. Call (617) 766-1259.`,
    openGraph: {
      title: `Shower Tile Installation in ${locationName}, MA | Aguirre Modern Tile`,
      description: `Expert shower tile installation in ${locationName}, Massachusetts. Custom shower tile designs, waterproofing, and professional installation.`,
    },
  }
}

export default async function ShowerTileLocationPage({ params }: Props) {
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
      serviceType="showertileinstallation"
      serviceTitle="Shower Tile Installation"
    />
  )
}
