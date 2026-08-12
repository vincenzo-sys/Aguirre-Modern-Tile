import Header from '@/components/Header'
import Footer from '@/components/Footer'
import MobileStickyCTA from '@/components/MobileStickyCTA'
import { getCmsGlobal } from '@/lib/cms'

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let navItems = [
    { label: 'Home', href: '/' },
    { label: 'Services', href: '/services' },
    { label: 'Tile Samples', href: '/tile-samples' },
    { label: 'Our Process', href: '/process' },
    { label: 'Gallery', href: '/gallery' },
    { label: 'About', href: '/about' },
    { label: 'Blog', href: '/blog' },
    { label: 'Contact', href: '/contact' },
  ]
  let phone = '(617) 766-1259'

  try {
    const [nav, companyInfo] = await Promise.all([
      getCmsGlobal<any>('navigation'),
      getCmsGlobal<any>('company-info'),
    ])
    if (nav?.mainNav && nav.mainNav.length > 0) {
      navItems = nav.mainNav as { label: string; href: string }[]
    }
    if (companyInfo?.phone) {
      phone = companyInfo.phone
    }
  } catch {
    // CMS not available — use defaults
  }

  return (
    <>
      <Header navItems={navItems} phone={phone} />
      <main className="pb-24 lg:pb-0">{children}</main>
      <Footer />
      <MobileStickyCTA phone={phone} />
    </>
  )
}
