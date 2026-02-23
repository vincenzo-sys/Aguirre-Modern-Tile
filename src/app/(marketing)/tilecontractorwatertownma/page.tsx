import { Metadata } from 'next'
import LocationPage from '@/components/LocationPage'

export const metadata: Metadata = {
  title: 'Tile Contractor Watertown MA | Aguirre Modern Tile',
  description: 'Expert tile contractor in Watertown, MA. Bathroom remodels, shower tile, floor installation, and backsplashes. Free estimates, 5-star reviews.',
}

export default function WatertownPage() {
  return <LocationPage city="Watertown" />
}
