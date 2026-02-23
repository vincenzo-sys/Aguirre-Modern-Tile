'use client'

import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const serviceAreas: { name: string; lat: number; lng: number }[] = [
  // Core service area
  { name: 'Revere', lat: 42.4084, lng: -71.0120 },
  { name: 'Boston', lat: 42.3601, lng: -71.0589 },
  { name: 'Cambridge', lat: 42.3736, lng: -71.1097 },
  { name: 'Somerville', lat: 42.3876, lng: -71.0995 },
  { name: 'Chelsea', lat: 42.3918, lng: -71.0328 },
  { name: 'Everett', lat: 42.4084, lng: -71.0537 },
  { name: 'Malden', lat: 42.4251, lng: -71.0662 },
  { name: 'Medford', lat: 42.4184, lng: -71.1062 },
  { name: 'Melrose', lat: 42.4587, lng: -71.0662 },
  { name: 'Winthrop', lat: 42.3751, lng: -70.9828 },
  { name: 'Brookline', lat: 42.3318, lng: -71.1212 },
  { name: 'Arlington', lat: 42.4154, lng: -71.1565 },
  { name: 'Belmont', lat: 42.3959, lng: -71.1778 },
  { name: 'Watertown', lat: 42.3704, lng: -71.1824 },
  // North Shore
  { name: 'Lynn', lat: 42.4668, lng: -70.9495 },
  { name: 'Saugus', lat: 42.4643, lng: -71.0105 },
  { name: 'Nahant', lat: 42.4268, lng: -70.9188 },
  { name: 'Swampscott', lat: 42.4709, lng: -70.9176 },
  { name: 'Marblehead', lat: 42.4599, lng: -70.8578 },
  { name: 'Salem', lat: 42.5195, lng: -70.8967 },
  { name: 'Peabody', lat: 42.5279, lng: -70.9287 },
  { name: 'Danvers', lat: 42.5751, lng: -70.9304 },
  { name: 'Beverly', lat: 42.5584, lng: -70.8800 },
  { name: 'Gloucester', lat: 42.6159, lng: -70.6620 },
  { name: 'Rockport', lat: 42.6537, lng: -70.6206 },
  // North
  { name: 'Stoneham', lat: 42.4751, lng: -71.0995 },
  { name: 'Wakefield', lat: 42.5037, lng: -71.0726 },
  { name: 'Reading', lat: 42.5257, lng: -71.0953 },
  { name: 'Woburn', lat: 42.4793, lng: -71.1523 },
  { name: 'Winchester', lat: 42.4523, lng: -71.1370 },
  { name: 'Lexington', lat: 42.4473, lng: -71.2245 },
  { name: 'Burlington', lat: 42.5048, lng: -71.1956 },
  { name: 'Wilmington', lat: 42.5462, lng: -71.1734 },
  { name: 'Billerica', lat: 42.5584, lng: -71.2689 },
  { name: 'Lowell', lat: 42.6334, lng: -71.3162 },
  { name: 'Chelmsford', lat: 42.5998, lng: -71.3673 },
  { name: 'Tewksbury', lat: 42.6101, lng: -71.2342 },
  { name: 'Andover', lat: 42.6584, lng: -71.1368 },
  { name: 'North Andover', lat: 42.6987, lng: -71.1323 },
  { name: 'Lawrence', lat: 42.7070, lng: -71.1631 },
  { name: 'Methuen', lat: 42.7262, lng: -71.1909 },
  { name: 'Haverhill', lat: 42.7762, lng: -71.0773 },
  // West
  { name: 'Newton', lat: 42.3370, lng: -71.2092 },
  { name: 'Waltham', lat: 42.3765, lng: -71.2356 },
  { name: 'Needham', lat: 42.2834, lng: -71.2329 },
  { name: 'Wellesley', lat: 42.2968, lng: -71.2924 },
  { name: 'Natick', lat: 42.2834, lng: -71.3498 },
  { name: 'Framingham', lat: 42.2793, lng: -71.4162 },
  { name: 'Concord', lat: 42.4604, lng: -71.3489 },
  { name: 'Sudbury', lat: 42.3834, lng: -71.4162 },
  // South
  { name: 'Quincy', lat: 42.2529, lng: -71.0023 },
  { name: 'Braintree', lat: 42.2038, lng: -71.0015 },
  { name: 'Weymouth', lat: 42.2211, lng: -70.9399 },
  { name: 'Hingham', lat: 42.2418, lng: -70.8898 },
  { name: 'Milton', lat: 42.2498, lng: -71.0662 },
  { name: 'Dedham', lat: 42.2418, lng: -71.1662 },
  { name: 'Norwood', lat: 42.1945, lng: -71.2000 },
  { name: 'Randolph', lat: 42.1626, lng: -71.0418 },
]

export default function ServiceAreaMapInner() {
  return (
    <MapContainer
      center={[42.42, -71.05]}
      zoom={10}
      className="w-full h-full"
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {serviceAreas.map((area) => (
        <CircleMarker
          key={area.name}
          center={[area.lat, area.lng]}
          radius={8}
          pathOptions={{
            color: '#0284c7',
            fillColor: '#0284c7',
            fillOpacity: 0.5,
            weight: 2,
          }}
        >
          <Popup>
            <p className="font-semibold text-sm">{area.name}, MA</p>
            <p className="text-xs text-gray-500">Tile installation & repair</p>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
