import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import ToastContainer from '@/components/Toast'
import './globals.css'

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
        <link rel="icon" href="/favicon.ico" />
        <meta name="theme-color" content="#0284c7" />
      </head>
      <body className={inter.className}>
        {children}
        <ToastContainer />
      </body>
    </html>
  )
}
