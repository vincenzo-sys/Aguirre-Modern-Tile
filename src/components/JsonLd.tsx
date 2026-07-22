interface JsonLdProps {
  data: Record<string, unknown>
}

// JSON-LD structured data component. Some callers pass CMS/dynamic strings
// (service name/description, FAQ Q&A), so we escape "<" in the serialized JSON.
// JSON.stringify does NOT escape "<", so a value containing "</script>" would
// otherwise break out of this tag (stored XSS). Replacing "<" with the escape
// "\\u003c" keeps the JSON valid while making a </script> breakout impossible.
export default function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}

// LocalBusiness schema for the homepage and about page
export function localBusinessJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'HomeAndConstructionBusiness',
    name: 'Aguirre Modern Tile',
    description:
      'Professional tile installation in Greater Boston. 15+ years experience, 150+ five-star Google reviews. Bathroom, shower, floor & backsplash tile experts.',
    url: 'https://aguirremoderntile.com',
    telephone: '+1-617-766-1259',
    email: 'vin@moderntile.pro',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Revere',
      addressRegion: 'MA',
      postalCode: '02151',
      addressCountry: 'US',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 42.4084,
      longitude: -71.012,
    },
    areaServed: {
      '@type': 'GeoCircle',
      geoMidpoint: {
        '@type': 'GeoCoordinates',
        latitude: 42.3601,
        longitude: -71.0589,
      },
      geoRadius: '30',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.9',
      reviewCount: '150',
      bestRating: '5',
    },
    priceRange: '$$',
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '07:00',
        closes: '18:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'Saturday',
        opens: '08:00',
        closes: '14:00',
      },
    ],
    image: 'https://aguirremoderntile.com/images/bathroom-service1.jpg',
    sameAs: [],
  }
}

// Location-specific LocalBusiness schema for the 3,400+ programmatic location
// pages. Same business identity as localBusinessJsonLd(), but areaServed is
// narrowed to the page's town/neighborhood and the URL/name are made unique so
// each location page carries its own self-referential structured data (helps
// Google associate the page with that locality for local search).
export function localBusinessLocationJsonLd(params: {
  locationName: string
  url: string
  serviceTitle: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HomeAndConstructionBusiness',
    name: `Aguirre Modern Tile — ${params.serviceTitle} in ${params.locationName}`,
    description: `Professional ${params.serviceTitle.toLowerCase()} serving ${params.locationName}, Massachusetts and the Greater Boston area. Licensed, insured, 150+ five-star reviews.`,
    url: params.url,
    telephone: '+1-617-766-1259',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Revere',
      addressRegion: 'MA',
      addressCountry: 'US',
    },
    areaServed: {
      '@type': 'City',
      name: params.locationName,
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.9',
      reviewCount: '150',
      bestRating: '5',
    },
    priceRange: '$$',
    image: 'https://aguirremoderntile.com/images/bathroom-service1.jpg',
  }
}

// Service schema for individual service pages
export function serviceJsonLd(service: {
  name: string
  description: string
  slug: string
  priceRange?: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.name,
    description: service.description,
    url: `https://aguirremoderntile.com/services/${service.slug}`,
    provider: {
      '@type': 'HomeAndConstructionBusiness',
      name: 'Aguirre Modern Tile',
      telephone: '+1-617-766-1259',
      url: 'https://aguirremoderntile.com',
    },
    areaServed: {
      '@type': 'State',
      name: 'Massachusetts',
    },
    ...(service.priceRange && {
      offers: {
        '@type': 'Offer',
        priceSpecification: {
          '@type': 'PriceSpecification',
          priceCurrency: 'USD',
        },
      },
    }),
  }
}

// FAQ schema for pages with Q&A content
export function faqJsonLd(
  faqs: { question: string; answer: string }[]
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  }
}

// BreadcrumbList schema
export function breadcrumbJsonLd(
  items: { name: string; url: string }[]
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }
}
