import { Metadata } from 'next'
import LocationPage from '@/components/LocationPage'

export const metadata: Metadata = {
  title: 'Tile Contractor Chelsea MA | Aguirre Modern Tile',
  description: 'Expert tile contractor in Chelsea, MA. Bathroom remodels, shower tile, floor installation, and backsplashes. Free estimates, 5-star reviews.',
}

export default function ChelseaPage() {
  return <LocationPage city="Chelsea" />
}
