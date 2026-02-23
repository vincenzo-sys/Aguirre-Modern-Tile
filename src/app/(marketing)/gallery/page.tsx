import { Metadata } from 'next'
import Image from 'next/image'
import { getPayloadClient } from '@/lib/payload'

export const metadata: Metadata = {
  title: 'Gallery | Aguirre Modern Tile',
  description: 'View our portfolio of tile installation projects in Greater Boston. Photos of bathrooms, showers, floors, and backsplashes.',
}

const defaultProjects = [
  { id: 1, image: '/images/bathroom1.jpg', title: 'Bathroom Tile', category: 'Bathroom' },
  { id: 2, image: '/images/bathroom3.jpg', title: 'Bathroom Remodel', category: 'Bathroom' },
  { id: 3, image: '/images/bathroom-service1.jpg', title: 'Bathroom Installation', category: 'Bathroom' },
  { id: 4, image: '/images/bathroom-service2.jpg', title: 'Bathroom Tile Work', category: 'Bathroom' },
  { id: 5, image: '/images/bathroom-service3.jpg', title: 'Bathroom Project', category: 'Bathroom' },
  { id: 6, image: '/images/bathroom-service4.jpg', title: 'Bathroom Transformation', category: 'Bathroom' },
  { id: 7, image: '/images/bathroom-service5.jpg', title: 'Bathroom Tile', category: 'Bathroom' },
  { id: 8, image: '/images/shower1.jpg', title: 'Shower Tile', category: 'Shower' },
  { id: 9, image: '/images/gallery2.jpg', title: 'Custom Shower', category: 'Shower' },
  { id: 10, image: '/images/floor1.jpg', title: 'Floor Tile', category: 'Floor' },
  { id: 11, image: '/images/floor2.jpg', title: 'Floor Installation', category: 'Floor' },
  { id: 12, image: '/images/floor3.jpg', title: 'Floor Tile Project', category: 'Floor' },
  { id: 13, image: '/images/floor4.jpg', title: 'Floor Work', category: 'Floor' },
  { id: 14, image: '/images/floor5.jpg', title: 'Tile Floor', category: 'Floor' },
  { id: 15, image: '/images/floor6.jpg', title: 'Floor Tile', category: 'Floor' },
  { id: 16, image: '/images/floor7.jpg', title: 'Floor Installation', category: 'Floor' },
  { id: 17, image: '/images/floor8.jpg', title: 'Floor Project', category: 'Floor' },
  { id: 18, image: '/images/backsplash1.jpg', title: 'Backsplash', category: 'Backsplash' },
  { id: 19, image: '/images/backsplash2.jpg', title: 'Kitchen Backsplash', category: 'Backsplash' },
  { id: 20, image: '/images/backsplash3.jpg', title: 'Backsplash Tile', category: 'Backsplash' },
  { id: 21, image: '/images/backsplash4.jpg', title: 'Backsplash Installation', category: 'Backsplash' },
  { id: 22, image: '/images/backsplash5.jpg', title: 'Custom Backsplash', category: 'Backsplash' },
  { id: 23, image: '/images/backsplash6.jpg', title: 'Backsplash Work', category: 'Backsplash' },
  { id: 24, image: '/images/backsplash7.jpg', title: 'Tile Backsplash', category: 'Backsplash' },
  { id: 25, image: '/images/backsplash8.jpg', title: 'Backsplash Project', category: 'Backsplash' },
  { id: 26, image: '/images/backsplash9.jpg', title: 'Backsplash', category: 'Backsplash' },
  { id: 27, image: '/images/backsplash10.jpg', title: 'Kitchen Tile', category: 'Backsplash' },
  { id: 28, image: '/images/repair1.jpg', title: 'Tile Repair', category: 'Repair' },
  { id: 29, image: '/images/repair2.jpg', title: 'Tile Repair', category: 'Repair' },
  { id: 30, image: '/images/repair3.jpg', title: 'Repair Work', category: 'Repair' },
  { id: 31, image: '/images/repair4.jpg', title: 'Tile Fix', category: 'Repair' },
  { id: 32, image: '/images/repair5.jpg', title: 'Repair Project', category: 'Repair' },
  { id: 33, image: '/images/reglaze1.jpg', title: 'Tile Reglazing', category: 'Reglazing' },
  { id: 34, image: '/images/reglaze2.jpg', title: 'Reglazing', category: 'Reglazing' },
  { id: 35, image: '/images/reglaze3.jpg', title: 'Reglaze Work', category: 'Reglazing' },
  { id: 36, image: '/images/reglaze4.jpg', title: 'Tile Refresh', category: 'Reglazing' },
  { id: 37, image: '/images/reglaze5.jpg', title: 'Reglazing Project', category: 'Reglazing' },
  { id: 38, image: '/images/gallery1.jpg', title: 'Tile Project', category: 'Other' },
  { id: 39, image: '/images/gallery3.jpg', title: 'Tile Installation', category: 'Other' },
  { id: 40, image: '/images/gallery4.jpg', title: 'Tile Work', category: 'Other' },
  { id: 41, image: '/images/gallery5.jpg', title: 'Tile Project', category: 'Other' },
  { id: 42, image: '/images/gallery6.jpg', title: 'Tile Installation', category: 'Other' },
  { id: 43, image: '/images/gallery7.jpg', title: 'Custom Tile', category: 'Other' },
  { id: 44, image: '/images/gallery8.jpg', title: 'Tile Transformation', category: 'Other' },
  { id: 45, image: '/images/gallery9.jpg', title: 'Tile Work', category: 'Other' },
  { id: 46, image: '/images/gallery10.jpg', title: 'Finished Project', category: 'Other' },
]

export default async function GalleryPage() {
  let projects = defaultProjects

  try {
    const payload = await getPayloadClient()
    const galleryData = await payload.find({ collection: 'gallery-projects', sort: 'sortOrder', limit: 100 })

    if (galleryData.docs.length > 0) {
      projects = galleryData.docs.map((p: any, i: number) => ({
        id: i + 1,
        image: p.image,
        title: p.title,
        category: p.category,
      }))
    }
  } catch {
    // Payload not initialized yet — use defaults
  }

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-900 to-primary-900 text-white section-padding">
        <div className="container-custom">
          <div className="max-w-3xl">
            <h1 className="heading-primary text-white mb-6">Our Work</h1>
            <p className="text-xl text-gray-300">
              Browse our portfolio of {projects.length}+ tile installations across Greater Boston.
            </p>
          </div>
        </div>
      </section>

      {/* Gallery Grid */}
      <section className="section-padding">
        <div className="container-custom">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {projects.map((project) => (
              <div key={project.id} className="group relative aspect-[4/3] rounded-xl overflow-hidden shadow-sm">
                <Image
                  src={project.image}
                  alt={project.title}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <span className="text-xs font-medium px-2 py-1 bg-primary-500 text-white rounded-full">
                      {project.category}
                    </span>
                    <h3 className="text-white font-semibold mt-2">{project.title}</h3>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding bg-primary-600 text-white">
        <div className="container-custom text-center">
          <h2 className="heading-secondary text-white mb-4">
            Want Results Like These?
          </h2>
          <p className="text-xl text-primary-100 mb-8 max-w-2xl mx-auto">
            Get a free estimate for your tile project. We respond within 5 minutes.
          </p>
          <a href="/" className="btn-cta bg-white text-primary-600 hover:bg-gray-100">
            Get Your Free Estimate
          </a>
        </div>
      </section>
    </>
  )
}
