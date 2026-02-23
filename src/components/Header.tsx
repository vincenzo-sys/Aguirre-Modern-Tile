'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Menu, X, Phone } from 'lucide-react'

interface HeaderProps {
  navItems: { label: string; href: string }[]
  phone: string
}

export default function Header({ navItems, phone }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const phoneDigits = phone.replace(/\D/g, '')

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      {/* Top Bar */}
      <div className="bg-primary-600 text-white py-2 px-4">
        <div className="container-custom flex justify-between items-center text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span>We Answer in 5 Minutes</span>
            </div>
            <span className="hidden md:inline">|</span>
            <span className="hidden md:inline">Licensed & Insured</span>
          </div>
          <a href={`tel:${phoneDigits}`} className="flex items-center gap-2 font-semibold hover:text-primary-200">
            <Phone className="w-4 h-4" />
            {phone}
          </a>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="container-custom py-4 px-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="w-12 h-12 relative rounded-lg overflow-hidden">
              <Image
                src="/images/logo.jpg"
                alt="Aguirre Modern Tile"
                fill
                className="object-cover"
              />
            </div>
            <div>
              <div className="font-bold text-xl text-gray-900">Aguirre Modern Tile</div>
              <div className="text-sm text-gray-500">Expert Tile Installation</div>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-8">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="text-gray-600 hover:text-primary-600 font-medium transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* CTA Button */}
          <div className="hidden lg:flex items-center gap-4">
            <a href="/contact" className="btn-primary">
              Get Free Estimate
            </a>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6 text-gray-600" />
            ) : (
              <Menu className="w-6 h-6 text-gray-600" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden mt-4 py-4 border-t">
            <div className="flex flex-col gap-4">
              {navItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="text-gray-600 hover:text-primary-600 font-medium py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
              <a href="/contact" className="btn-primary text-center mt-4">
                Get Free Estimate
              </a>
            </div>
          </div>
        )}
      </nav>
    </header>
  )
}
