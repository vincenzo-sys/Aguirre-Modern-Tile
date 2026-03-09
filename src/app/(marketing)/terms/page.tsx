import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service | Aguirre Modern Tile',
  description: 'Terms of service for Aguirre Modern Tile. Understand the terms and conditions for using our website and services.',
}

export default function TermsOfServicePage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-900 to-primary-900 text-white section-padding">
        <div className="container-custom">
          <div className="max-w-3xl">
            <h1 className="heading-primary text-white mb-6">Terms of Service</h1>
            <p className="text-xl text-gray-300">
              Last updated: March 8, 2026
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="section-padding">
        <div className="container-custom max-w-3xl">
          <div className="prose prose-gray max-w-none space-y-8">

            <div>
              <h2 className="heading-secondary mb-4">Agreement to Terms</h2>
              <p className="text-body">
                By accessing or using the Aguirre Modern Tile website at aguirremoderntile.com, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our website.
              </p>
            </div>

            <div>
              <h2 className="heading-secondary mb-4">Services</h2>
              <p className="text-body">
                Aguirre Modern Tile provides tile installation, repair, and reglazing services in the Greater Boston area. Our website allows you to learn about our services, view our portfolio, request quotes, and contact us. Specific project terms, pricing, and timelines are agreed upon separately for each job.
              </p>
            </div>

            <div>
              <h2 className="heading-secondary mb-4">Quotes and Estimates</h2>
              <p className="text-body mb-4">
                Quotes and estimates provided through our website or in person are subject to the following:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-600">
                <li>Online quotes are estimates based on the information and photos you provide. Final pricing is confirmed after an in-person assessment.</li>
                <li>Quotes are valid for 30 days from the date provided unless otherwise stated.</li>
                <li>Pricing may change if the actual scope of work differs from the original description.</li>
                <li>A signed agreement is required before work begins.</li>
              </ul>
            </div>

            <div>
              <h2 className="heading-secondary mb-4">User Submissions</h2>
              <p className="text-body mb-4">
                When you submit information through our forms (contact forms, quote requests, photo uploads), you agree that:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-600">
                <li>The information you provide is accurate and complete.</li>
                <li>You have the right to share any photos or images you upload.</li>
                <li>We may use submitted project photos for internal assessment purposes.</li>
                <li>You will not submit harmful, offensive, or misleading content.</li>
              </ul>
            </div>

            <div>
              <h2 className="heading-secondary mb-4">Intellectual Property</h2>
              <p className="text-body">
                All content on this website, including text, images, logos, and design, is the property of Aguirre Modern Tile and is protected by applicable intellectual property laws. You may not reproduce, distribute, or use our content without written permission, except for personal, non-commercial reference.
              </p>
            </div>

            <div>
              <h2 className="heading-secondary mb-4">Portfolio and Project Photos</h2>
              <p className="text-body">
                Photos displayed on our website and portfolio represent actual work completed by Aguirre Modern Tile. Results may vary based on materials selected, existing conditions, and project specifications. Portfolio photos are for illustrative purposes and do not guarantee identical results.
              </p>
            </div>

            <div>
              <h2 className="heading-secondary mb-4">Limitation of Liability</h2>
              <p className="text-body">
                Our website is provided &quot;as is&quot; without warranties of any kind. Aguirre Modern Tile is not liable for any damages arising from your use of the website, including but not limited to errors, interruptions, or inaccuracies in content. Liability related to tile installation services is governed by the specific service agreement for each project.
              </p>
            </div>

            <div>
              <h2 className="heading-secondary mb-4">Third-Party Links</h2>
              <p className="text-body">
                Our website may contain links to third-party websites, including Google Maps and review platforms. We are not responsible for the content, privacy practices, or availability of these external sites.
              </p>
            </div>

            <div>
              <h2 className="heading-secondary mb-4">Service Area</h2>
              <p className="text-body">
                Aguirre Modern Tile serves the Greater Boston area, including but not limited to Revere, Boston, Cambridge, Somerville, Brookline, Medford, Malden, and surrounding communities. Availability outside these areas is at our discretion.
              </p>
            </div>

            <div>
              <h2 className="heading-secondary mb-4">Governing Law</h2>
              <p className="text-body">
                These Terms of Service are governed by the laws of the Commonwealth of Massachusetts. Any disputes arising from these terms will be resolved in the courts of Suffolk County, Massachusetts.
              </p>
            </div>

            <div>
              <h2 className="heading-secondary mb-4">Changes to Terms</h2>
              <p className="text-body">
                We may update these Terms of Service at any time. Continued use of the website after changes are posted constitutes your acceptance of the updated terms.
              </p>
            </div>

            <div>
              <h2 className="heading-secondary mb-4">Contact Us</h2>
              <p className="text-body">
                If you have questions about these Terms of Service, contact us at:
              </p>
              <div className="mt-4 p-6 bg-gray-50 rounded-xl">
                <p className="font-semibold text-gray-900">Aguirre Modern Tile</p>
                <p className="text-gray-600">106 Pemberton St, Revere, MA 02151</p>
                <p className="text-gray-600">Email: vin@moderntile.pro</p>
                <p className="text-gray-600">Phone: (617) 766-1259</p>
              </div>
            </div>

          </div>
        </div>
      </section>
    </>
  )
}
