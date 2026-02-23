import { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Bathroom Tile Gallery | Aguirre Modern Tile',
  description: 'Browse our bathroom tile installation gallery. See our work in Greater Boston - full remodels, showers, floors, and more.',
}

const bathrooms = [
  { image: '/images/bathroom1.jpg', title: 'Modern Bathroom' },
  { image: '/images/bathroom3.jpg', title: 'Bathroom Remodel' },
  { image: '/images/bathroom-service1.jpg', title: 'Bathroom Installation' },
  { image: '/images/bathroom-service2.jpg', title: 'Bathroom Tile Work' },
  { image: '/images/bathroom-service3.jpg', title: 'Bathroom Project' },
  { image: '/images/bathroom-service4.jpg', title: 'Bathroom Transformation' },
  { image: '/images/bathroom-service5.jpg', title: 'Custom Bathroom' },
  { image: '/images/shower1.jpg', title: 'Shower Installation' },
  { image: '/images/gallery1.jpg', title: 'Tile Project' },
  { image: '/images/gallery2.jpg', title: 'Custom Shower' },
]

export default function Bathrooms1Page() {
  return (
    <>
      <section className="bg-gradient-to-br from-gray-900 to-primary-900 text-white section-padding">
        <div className="container-custom">
          <div className="max-w-3xl">
            <h1 className="heading-primary text-white mb-6">Bathroom Gallery</h1>
            <p className="text-xl text-gray-300">
              Browse our bathroom tile installations across Greater Boston.
            </p>
          </div>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-custom">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {bathrooms.map((bathroom, index) => (
              <div key={index} className="group relative aspect-[4/3] rounded-xl overflow-hidden shadow-sm">
                <Image
                  src={bathroom.image}
                  alt={bathroom.title}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="text-white font-semibold">{bathroom.title}</h3>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding bg-primary-600 text-white">
        <div className="container-custom text-center">
          <h2 className="heading-secondary text-white mb-4">Want a Bathroom Like These?</h2>
          <p className="text-xl text-primary-100 mb-8">Get a free estimate for your bathroom project.</p>
          <Link href="/" className="btn-cta bg-white text-primary-600 hover:bg-gray-100">
            Get Your Free Estimate
          </Link>
        </div>
      </section>
    </>
  )
}
