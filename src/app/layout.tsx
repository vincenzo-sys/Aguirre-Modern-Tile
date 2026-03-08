import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import ToastContainer from '@/components/Toast'
import './globals.css'

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL('https://aguirremoderntile.com'),
  title: 'Aguirre Modern Tile | Expert Tile Installation in Greater Boston',
  description: 'Professional tile installation in Greater Boston. 15+ years experience, 5-star rated on Google. Bathroom, shower, floor & backsplash tile experts.',
  keywords: 'tile installation, bathroom tile, shower tile, Boston tile contractor, Revere tile, tile repair',
  openGraph: {
    title: 'Aguirre Modern Tile | Expert Tile Installation in Greater Boston',
    description: 'Professional tile installation with 15+ years experience. 150+ five-star Google reviews.',
    url: 'https://aguirremoderntile.com',
    siteName: 'Aguirre Modern Tile',
    locale: 'en_US',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <meta name="theme-color" content="#0284c7" />
      </head>
      <body className={inter.className}>
        {children}
        <ToastContainer />
        {GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('consent', 'default', {
                  analytics_storage: 'granted',
                  ad_storage: 'denied',
                });
                gtag('config', '${GA_MEASUREMENT_ID}');
              `}
            </Script>
          </>
        )}
      </body>
    </html>
  )
}
