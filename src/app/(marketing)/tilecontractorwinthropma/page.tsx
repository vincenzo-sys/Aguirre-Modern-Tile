import { Metadata } from 'next'
import LocationPage from '@/components/LocationPage'

export const metadata: Metadata = {
  title: 'Tile Contractor Winthrop MA | Aguirre Modern Tile',
  description: 'Expert tile contractor in Winthrop, MA. Bathroom remodels, shower tile, floor installation, and backsplashes. Free estimates, 5-star reviews.',
}

export default function WinthropPage() {
  return <LocationPage city="Winthrop" />
}
