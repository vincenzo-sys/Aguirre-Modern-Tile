import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy | Aguirre Modern Tile',
  description: 'Privacy policy for Aguirre Modern Tile. Learn how we collect, use, and protect your personal information.',
}

export default function PrivacyPolicyPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-900 to-primary-900 text-white section-padding">
        <div className="container-custom">
          <div className="max-w-3xl">
            <h1 className="heading-primary text-white mb-6">Privacy Policy</h1>
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
              <h2 className="heading-secondary mb-4">Introduction</h2>
              <p className="text-body">
                Aguirre Modern Tile (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) respects your privacy. This Privacy Policy explains how we collect, use, and protect your personal information when you visit our website at aguirremoderntile.com or use our services.
              </p>
            </div>

            <div>
              <h2 className="heading-secondary mb-4">Information We Collect</h2>
              <p className="text-body mb-4">We collect information you provide directly to us, including:</p>
              <ul className="list-disc pl-6 space-y-2 text-gray-600">
                <li><strong>Contact information:</strong> Name, email address, and phone number when you submit a contact form or request a quote.</li>
                <li><strong>Project details:</strong> Information about your tile project, including photos you upload, project type, dimensions, and preferences.</li>
                <li><strong>Communications:</strong> Any messages or information you provide when contacting us.</li>
              </ul>
            </div>

            <div>
              <h2 className="heading-secondary mb-4">Automatically Collected Information</h2>
              <p className="text-body mb-4">When you visit our website, we may automatically collect:</p>
              <ul className="list-disc pl-6 space-y-2 text-gray-600">
                <li><strong>Usage data:</strong> Pages visited, time spent on pages, and navigation patterns through Google Analytics (GA4).</li>
                <li><strong>Device information:</strong> Browser type, operating system, and screen resolution.</li>
                <li><strong>IP address:</strong> Used for rate limiting and security purposes only.</li>
              </ul>
            </div>

            <div>
              <h2 className="heading-secondary mb-4">How We Use Your Information</h2>
              <p className="text-body mb-4">We use your information to:</p>
              <ul className="list-disc pl-6 space-y-2 text-gray-600">
                <li>Respond to your inquiries and provide quotes for tile projects.</li>
                <li>Schedule and coordinate tile installation services.</li>
                <li>Send you project updates and communications related to your service.</li>
                <li>Improve our website and services through analytics.</li>
                <li>Protect against fraud and abuse.</li>
              </ul>
            </div>

            <div>
              <h2 className="heading-secondary mb-4">How We Share Your Information</h2>
              <p className="text-body mb-4">We do not sell your personal information. We may share your information with:</p>
              <ul className="list-disc pl-6 space-y-2 text-gray-600">
                <li><strong>Service providers:</strong> We use Resend for email delivery and Supabase for secure data storage. These providers only process data on our behalf.</li>
                <li><strong>Analytics:</strong> Google Analytics collects anonymized usage data to help us understand how visitors use our site.</li>
                <li><strong>Legal requirements:</strong> We may disclose information if required by law or to protect our rights.</li>
              </ul>
            </div>

            <div>
              <h2 className="heading-secondary mb-4">Google Analytics</h2>
              <p className="text-body">
                We use Google Analytics 4 (GA4) to understand website traffic and usage patterns. Google Analytics uses cookies to collect anonymized data. You can opt out of Google Analytics by installing the{' '}
                <a
                  href="https://tools.google.com/dlpage/gaoptout"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-700 underline"
                >
                  Google Analytics Opt-Out Browser Add-on
                </a>.
                We do not use Google Analytics for advertising purposes, and ad storage is disabled by default on our site.
              </p>
            </div>

            <div>
              <h2 className="heading-secondary mb-4">Data Security</h2>
              <p className="text-body">
                We take reasonable measures to protect your personal information. Form submissions are transmitted securely, and data is stored using industry-standard encryption. However, no method of transmission over the Internet is 100% secure.
              </p>
            </div>

            <div>
              <h2 className="heading-secondary mb-4">Data Retention</h2>
              <p className="text-body">
                We retain your contact information and project details for as long as necessary to provide our services and maintain business records. You may request deletion of your data at any time by contacting us.
              </p>
            </div>

            <div>
              <h2 className="heading-secondary mb-4">Your Rights</h2>
              <p className="text-body mb-4">You have the right to:</p>
              <ul className="list-disc pl-6 space-y-2 text-gray-600">
                <li>Request access to the personal information we hold about you.</li>
                <li>Request correction of inaccurate information.</li>
                <li>Request deletion of your personal information.</li>
                <li>Opt out of analytics tracking.</li>
              </ul>
            </div>

            <div>
              <h2 className="heading-secondary mb-4">Children&apos;s Privacy</h2>
              <p className="text-body">
                Our website is not directed at children under 13, and we do not knowingly collect personal information from children.
              </p>
            </div>

            <div>
              <h2 className="heading-secondary mb-4">Changes to This Policy</h2>
              <p className="text-body">
                We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated &quot;Last updated&quot; date.
              </p>
            </div>

            <div>
              <h2 className="heading-secondary mb-4">Contact Us</h2>
              <p className="text-body">
                If you have questions about this Privacy Policy or want to exercise your data rights, contact us at:
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
