import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { getCmsGlobal } from '@/lib/cms'

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let navItems = [
    { label: 'Home', href: '/' },
    { label: 'Services', href: '/services' },
    { label: 'Our Process', href: '/process' },
    { label: 'Gallery', href: '/gallery' },
    { label: 'About', href: '/about' },
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
      <main>{children}</main>
      <Footer />
    </>
  )
}
