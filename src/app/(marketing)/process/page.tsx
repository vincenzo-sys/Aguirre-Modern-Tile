import { Metadata } from 'next'
import { Camera, Clock, CheckCircle, Phone, Droplets, Layers, Ruler, Shield, Wrench } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Our Process | Aguirre Modern Tile',
  description: 'Learn about our tile installation process, from virtual estimates to quality waterproofing systems. KERDI-BOARD, GO-BOARD, and expert techniques.',
}

const estimateSteps = [
  {
    icon: <Camera className="w-8 h-8" />,
    title: 'Submit Your Project',
    description: 'Upload photos, share dimensions, tell us your vision. The more detail, the better.',
  },
  {
    icon: <Clock className="w-8 h-8" />,
    title: 'Same-Day Response',
    description: 'We review your photos and send you a ballpark range—usually within hours, not days.',
  },
  {
    icon: <Phone className="w-8 h-8" />,
    title: 'If It Fits Your Budget',
    description: 'We schedule a quick in-person visit to confirm details and finalize pricing.',
  },
  {
    icon: <CheckCircle className="w-8 h-8" />,
    title: 'No Surprises',
    description: 'Final price is the price. We don\'t add hidden fees or change orders without discussion.',
  },
]

const waterproofingSystems = [
  {
    name: 'KERDI-BOARD',
    description: 'Lightweight, waterproof building panel that\'s ready to tile. Perfect for creating niches, benches, and curbs.',
    benefits: ['100% waterproof', 'Lightweight & easy to cut', 'Creates custom features', 'Schluter warranty'],
  },
  {
    name: 'GO-BOARD',
    description: 'Foam-core, fully waterproof tile backer. Similar benefits to KERDI-BOARD with excellent thermal properties.',
    benefits: ['Fully waterproof', 'Excellent insulation', 'Easy installation', 'Mold resistant'],
  },
  {
    name: 'KERDI Membrane',
    description: 'Flexible waterproofing membrane applied over cement board. The gold standard for shower waterproofing.',
    benefits: ['Bonds to substrate', 'Handles movement', 'Proven performance', 'Industry leading'],
  },
]

const qualityCheckpoints = [
  'Level check at every stage',
  'Waterproof testing before tile',
  'Proper thinset coverage (no spot bonding)',
  'Consistent grout lines',
  'Clean edges and cuts',
  'Sealed grout when required',
  'Final walkthrough with customer',
]

export default function ProcessPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-900 to-primary-900 text-white section-padding">
        <div className="container-custom">
          <div className="max-w-3xl">
            <h1 className="heading-primary text-white mb-6">Our Process</h1>
            <p className="text-xl text-gray-300">
              From estimate to completion, we believe in doing things right.
              Here's what sets our work apart.
            </p>
          </div>
        </div>
      </section>

      {/* How We Estimate */}
      <section className="section-padding">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="heading-secondary mb-4">How We Estimate: Fast, Fair, Accurate</h2>
            <p className="text-body max-w-2xl mx-auto">
              We've done hundreds of virtual estimates. It saves you time—no need to schedule
              a visit unless we're a good fit.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {estimateSteps.map((step, index) => (
              <div key={step.title} className="text-center">
                <div className="relative">
                  <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center text-primary-600 mx-auto mb-4">
                    {step.icon}
                  </div>
                  <div className="absolute -top-2 -right-2 w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                    {index + 1}
                  </div>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-gray-600">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Waterproofing Systems */}
      <section className="section-padding bg-gray-50">
        <div className="container-custom">
          <div className="text-center mb-12">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Droplets className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="heading-secondary mb-4">Waterproofing Systems</h2>
            <p className="text-body max-w-2xl mx-auto">
              Water behind tile means mold, rot, and costly repairs.
              Proper waterproofing is the foundation of every shower we build.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {waterproofingSystems.map((system) => (
              <div key={system.name} className="bg-white rounded-xl p-6 shadow-sm">
                <h3 className="text-xl font-bold text-gray-900 mb-3">{system.name}</h3>
                <p className="text-gray-600 mb-4">{system.description}</p>
                <ul className="space-y-2">
                  {system.benefits.map((benefit) => (
                    <li key={benefit} className="flex items-center gap-2 text-gray-600">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      {benefit}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-8 p-6 bg-blue-50 rounded-xl">
            <h4 className="font-bold text-blue-900 mb-2">Why It Matters</h4>
            <p className="text-blue-800">
              Many contractors skip proper waterproofing to save time and money. The result?
              Showers that leak within a few years. We use industry-leading systems because
              we want your shower to last 20+ years, not 5.
            </p>
          </div>
        </div>
      </section>

      {/* Shower Pan & Drain */}
      <section className="section-padding">
        <div className="container-custom">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mb-6">
                <Layers className="w-8 h-8 text-primary-600" />
              </div>
              <h2 className="heading-secondary mb-4">Shower Pan & Drain Installation</h2>
              <p className="text-body mb-6">
                The shower pan is the most critical waterproofing layer. We offer multiple options:
              </p>

              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-bold text-gray-900 mb-1">Pre-Formed Shower Pans</h4>
                  <p className="text-gray-600 text-sm">
                    Modern, reliable, and faster to install. Works great for standard shower sizes.
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-bold text-gray-900 mb-1">Mud Bed (Traditional)</h4>
                  <p className="text-gray-600 text-sm">
                    Custom-built for unique sizes and shapes. Perfect slope guaranteed.
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-bold text-gray-900 mb-1">Linear Drains</h4>
                  <p className="text-gray-600 text-sm">
                    Modern look, better drainage, allows for large format tile on floor.
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-gray-200 rounded-2xl aspect-square">
              {/* Placeholder for image */}
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                [Shower Pan Installation Image]
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Substrate Preparation */}
      <section className="section-padding bg-gray-50">
        <div className="container-custom">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="md:order-2">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mb-6">
                <Ruler className="w-8 h-8 text-primary-600" />
              </div>
              <h2 className="heading-secondary mb-4">Substrate Preparation</h2>
              <p className="text-body mb-6">
                You can't build a great tile job on a bad foundation.
                We take substrate prep seriously.
              </p>

              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-primary-600 flex-shrink-0 mt-1" />
                  <div>
                    <span className="font-semibold text-gray-900">Cement Board</span>
                    <p className="text-gray-600 text-sm">Durock, Hardiebacker — moisture-resistant backer for wet areas.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-primary-600 flex-shrink-0 mt-1" />
                  <div>
                    <span className="font-semibold text-gray-900">Ditra Uncoupling Membrane</span>
                    <p className="text-gray-600 text-sm">Prevents cracked tiles by allowing substrate movement.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-primary-600 flex-shrink-0 mt-1" />
                  <div>
                    <span className="font-semibold text-gray-900">Floor Leveling</span>
                    <p className="text-gray-600 text-sm">Self-leveling compound for perfectly flat surfaces—essential for large format tile.</p>
                  </div>
                </li>
              </ul>
            </div>
            <div className="md:order-1 bg-gray-200 rounded-2xl aspect-square">
              {/* Placeholder for image */}
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                [Substrate Prep Image]
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quality Checkpoints */}
      <section className="section-padding">
        <div className="container-custom">
          <div className="max-w-3xl mx-auto text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="heading-secondary mb-4">Our Quality Checkpoints</h2>
            <p className="text-body mb-8">
              At every stage of the project, we verify our work meets the highest standards.
            </p>

            <div className="grid sm:grid-cols-2 gap-4 text-left">
              {qualityCheckpoints.map((checkpoint) => (
                <div
                  key={checkpoint}
                  className="flex items-center gap-3 bg-gray-50 rounded-lg p-4"
                >
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <span className="text-gray-700">{checkpoint}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding bg-primary-600 text-white">
        <div className="container-custom text-center">
          <h2 className="heading-secondary text-white mb-4">Ready to Start Your Project?</h2>
          <p className="text-xl text-primary-100 mb-8">
            Experience the difference that proper technique and quality materials make.
          </p>
          <a href="/contact" className="btn-cta">
            Get Your Free Estimate
          </a>
        </div>
      </section>
    </>
  )
}
