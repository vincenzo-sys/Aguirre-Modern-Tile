// Quote data structure and sample quotes

export interface QuoteLineItem {
  description: string
  quantity?: number
  unit?: string
  unitPrice?: number
  total: number
}

export interface Quote {
  id: string
  createdAt: string
  expiresAt: string
  status: 'pending' | 'accepted' | 'expired' | 'declined'

  // Customer info
  customer: {
    name: string
    email: string
    phone: string
    address: string
  }

  // Project details
  project: {
    type: 'bathroom' | 'shower' | 'floor' | 'backsplash' | 'repair' | 'reglazing' | 'other'
    title: string
    description: string
    location: string // Room/area description
  }

  // Line items
  lineItems: QuoteLineItem[]

  // Pricing
  subtotal: number
  discount?: {
    description: string
    amount: number
  }
  total: number

  // Payment terms
  depositRequired?: number
  depositPercent?: number
  paymentTerms: string

  // Notes
  notes?: string
  estimatedDuration?: string
}

// Sample quotes for testing
export const sampleQuotes: Record<string, Quote> = {
  'Q-2024-001': {
    id: 'Q-2024-001',
    createdAt: '2024-01-15',
    expiresAt: '2024-02-15',
    status: 'pending',
    customer: {
      name: 'John Smith',
      email: 'john.smith@email.com',
      phone: '(617) 555-0123',
      address: '123 Main Street, Cambridge, MA 02139',
    },
    project: {
      type: 'bathroom',
      title: 'Master Bathroom Tile Installation',
      description: 'Complete tile installation for master bathroom including floor, shower walls, and shower pan. Customer selected 12x24 porcelain tile in light gray for floors and white subway tile for shower walls.',
      location: 'Master Bathroom - Second Floor',
    },
    lineItems: [
      { description: 'Shower floor tile installation (mosaic)', quantity: 12, unit: 'sq ft', unitPrice: 25, total: 300 },
      { description: 'Shower wall tile installation (subway)', quantity: 85, unit: 'sq ft', unitPrice: 18, total: 1530 },
      { description: 'Bathroom floor tile installation (12x24 porcelain)', quantity: 48, unit: 'sq ft', unitPrice: 15, total: 720 },
      { description: 'Shower pan waterproofing (Kerdi system)', total: 450 },
      { description: 'Shower niche installation (2 niches)', quantity: 2, unit: 'each', unitPrice: 150, total: 300 },
      { description: 'Cement board installation', quantity: 97, unit: 'sq ft', unitPrice: 5, total: 485 },
      { description: 'Premium grout and sealant', total: 175 },
      { description: 'Tile trim and transitions', total: 220 },
    ],
    subtotal: 4180,
    discount: {
      description: 'New customer discount',
      amount: 200,
    },
    total: 3980,
    depositRequired: 1500,
    depositPercent: 38,
    paymentTerms: '38% deposit to schedule, balance due upon completion',
    notes: 'Price includes all labor and materials. Customer to have bathroom cleared before start date. Estimated start date: February 1, 2024.',
    estimatedDuration: '4-5 days',
  },
  'Q-2024-002': {
    id: 'Q-2024-002',
    createdAt: '2024-01-20',
    expiresAt: '2024-02-20',
    status: 'pending',
    customer: {
      name: 'Sarah Johnson',
      email: 'sarah.j@email.com',
      phone: '(781) 555-0456',
      address: '456 Oak Avenue, Somerville, MA 02144',
    },
    project: {
      type: 'backsplash',
      title: 'Kitchen Backsplash Installation',
      description: 'Install new subway tile backsplash in kitchen. White 3x6 subway tile in herringbone pattern from countertop to bottom of upper cabinets.',
      location: 'Kitchen',
    },
    lineItems: [
      { description: 'Backsplash tile installation (herringbone pattern)', quantity: 32, unit: 'sq ft', unitPrice: 22, total: 704 },
      { description: 'Tile cutting around outlets and switches', quantity: 6, unit: 'each', unitPrice: 25, total: 150 },
      { description: 'Surface preparation and cement board', total: 180 },
      { description: 'Premium grout (frost white)', total: 85 },
      { description: 'Edge trim installation', total: 120 },
    ],
    subtotal: 1239,
    total: 1239,
    depositRequired: 500,
    depositPercent: 40,
    paymentTerms: '40% deposit to schedule, balance due upon completion',
    estimatedDuration: '1-2 days',
  },
}

// Helper to get quote by ID
export function getQuoteById(id: string): Quote | undefined {
  return sampleQuotes[id]
}

// Helper to get similar project images based on project type
export function getSimilarProjectImages(projectType: Quote['project']['type']): string[] {
  const imagesByType: Record<string, string[]> = {
    bathroom: [
      '/images/bathroom-service1.jpg',
      '/images/bathroom-service2.jpg',
      '/images/bathroom-service3.jpg',
      '/images/bathroom-service4.jpg',
    ],
    shower: [
      '/images/shower1.jpg',
      '/images/bathroom-service1.jpg',
      '/images/bathroom-service3.jpg',
      '/images/bathroom-service5.jpg',
    ],
    floor: [
      '/images/floor1.jpg',
      '/images/floor2.jpg',
      '/images/floor3.jpg',
      '/images/floor4.jpg',
    ],
    backsplash: [
      '/images/backsplash1.jpg',
      '/images/backsplash2.jpg',
      '/images/backsplash3.jpg',
      '/images/backsplash4.jpg',
    ],
    repair: [
      '/images/repair1.jpg',
      '/images/repair2.jpg',
      '/images/bathroom-service1.jpg',
      '/images/floor1.jpg',
    ],
    reglazing: [
      '/images/bathroom1.jpg',
      '/images/reglaze1.jpg',
      '/images/reglaze2.jpg',
      '/images/reglaze3.jpg',
    ],
    other: [
      '/images/bathroom-service1.jpg',
      '/images/floor1.jpg',
      '/images/backsplash1.jpg',
      '/images/shower1.jpg',
    ],
  }
  return imagesByType[projectType] || imagesByType.other
}

// Upsells by project type
export function getUpsells(projectType: Quote['project']['type']): { title: string; description: string; price: string }[] {
  const upsellsByType: Record<string, { title: string; description: string; price: string }[]> = {
    bathroom: [
      { title: 'Heated Floor System', description: 'Electric radiant heating under your tile for warm floors year-round', price: 'From $800' },
      { title: 'Custom Shower Niche', description: 'Built-in storage niche for shampoo and soap', price: '$150 each' },
      { title: 'Accent Tile Strip', description: 'Decorative accent tile band to add visual interest', price: 'From $200' },
    ],
    shower: [
      { title: 'Frameless Glass Door', description: 'We can coordinate with our glass partners for a complete look', price: 'Quote available' },
      { title: 'Built-in Bench Seat', description: 'Tiled bench seat for comfort and accessibility', price: 'From $400' },
      { title: 'Rain Shower Head Tile Prep', description: 'Ceiling tile work for overhead shower installation', price: 'From $300' },
    ],
    floor: [
      { title: 'Heated Floor System', description: 'Electric radiant heating for warm, comfortable floors', price: 'From $800' },
      { title: 'Floor Leveling', description: 'Self-leveling compound for perfectly flat floors', price: '$5/sq ft' },
      { title: 'Transition Strips', description: 'Premium metal transitions between rooms', price: '$75 each' },
    ],
    backsplash: [
      { title: 'Under-Cabinet Lighting Prep', description: 'Tile work coordinated with lighting installation', price: 'From $150' },
      { title: 'Pot Filler Tile Backing', description: 'Reinforced backing for pot filler faucet', price: '$100' },
      { title: 'Full Height Extension', description: 'Extend backsplash to ceiling for dramatic effect', price: 'Quote based on size' },
    ],
    repair: [
      { title: 'Full Regrout', description: 'Remove and replace all grout for a fresh look', price: '$8/sq ft' },
      { title: 'Grout Sealing', description: 'Professional grout sealer application', price: '$3/sq ft' },
      { title: 'Caulk Replacement', description: 'Remove old caulk and apply fresh silicone', price: '$150' },
    ],
    reglazing: [
      { title: 'Chip Repair', description: 'Fix chips before reglazing for smooth finish', price: '$50/chip' },
      { title: 'Non-Slip Coating', description: 'Add texture for safer surfaces', price: '$100' },
      { title: 'Color Matching', description: 'Custom color matching to existing fixtures', price: '$75' },
    ],
    other: [
      { title: 'Design Consultation', description: 'Help selecting tile patterns and layouts', price: 'Free with project' },
      { title: 'Material Sourcing', description: 'We can pick up materials from your supplier', price: '$50' },
      { title: 'Debris Removal', description: 'Haul away old tile and construction debris', price: 'From $150' },
    ],
  }
  return upsellsByType[projectType] || upsellsByType.other
}

// What We Provide / What You Provide checklists by project type
export interface ProjectChecklist {
  weProvide: string[]
  youProvide: string[]
}

const defaultChecklist: ProjectChecklist = {
  weProvide: [
    'All labor and materials listed',
    'Surface preparation',
    'Waterproofing (where applicable)',
    'Daily cleanup',
    'Final walkthrough',
    '2-year workmanship warranty',
  ],
  youProvide: [
    'Access to work area',
    'Clear workspace before start date',
    'Decisions on tile selection (if not already chosen)',
    'Someone available for questions (phone is fine)',
  ],
}

const checklistByType: Record<string, Partial<ProjectChecklist>> = {
  bathroom: {
    weProvide: [
      'All labor and materials listed',
      'Surface preparation',
      'Waterproofing for wet areas',
      'Daily cleanup',
      'Final walkthrough',
      '2-year workmanship warranty',
    ],
  },
  shower: {
    weProvide: [
      'All labor and materials listed',
      'Surface preparation',
      'Complete waterproofing system',
      'Daily cleanup',
      'Final walkthrough',
      '2-year workmanship warranty',
    ],
  },
  backsplash: {
    weProvide: [
      'All labor and materials listed',
      'Surface preparation',
      'Protection of countertops and appliances',
      'Daily cleanup',
      'Final walkthrough',
      '2-year workmanship warranty',
    ],
    youProvide: [
      'Access to work area',
      'Clear countertops before start date',
      'Decisions on tile selection (if not already chosen)',
      'Someone available for questions (phone is fine)',
    ],
  },
  floor: {
    weProvide: [
      'All labor and materials listed',
      'Surface preparation and leveling',
      'Furniture protection (we move light items)',
      'Daily cleanup',
      'Final walkthrough',
      '2-year workmanship warranty',
    ],
    youProvide: [
      'Access to work area',
      'Heavy furniture moved before start date',
      'Decisions on tile selection (if not already chosen)',
      'Someone available for questions (phone is fine)',
    ],
  },
}

export function getProjectChecklist(projectType: Quote['project']['type']): ProjectChecklist {
  const typeOverrides = checklistByType[projectType] || {}
  return {
    weProvide: typeOverrides.weProvide || defaultChecklist.weProvide,
    youProvide: typeOverrides.youProvide || defaultChecklist.youProvide,
  }
}

// Reviews for display (would come from database in production)
export const customerReviews = [
  {
    name: 'Michael R.',
    location: 'Cambridge, MA',
    project: 'Bathroom Remodel',
    rating: 5,
    text: 'Christian and his team transformed our dated bathroom into a modern spa. The tile work is flawless - every cut is perfect, every line is straight. They showed up on time every day and left the space clean.',
    date: '2 weeks ago',
  },
  {
    name: 'Jennifer K.',
    location: 'Somerville, MA',
    project: 'Kitchen Backsplash',
    rating: 5,
    text: 'Quick, professional, and the herringbone pattern came out beautiful. They even helped us pick the right grout color. Would definitely hire again!',
    date: '1 month ago',
  },
  {
    name: 'David & Lisa M.',
    location: 'Boston, MA',
    project: 'Shower Renovation',
    rating: 5,
    text: 'After getting 5 quotes, we chose Aguirre Modern Tile for their attention to detail and fair pricing. The waterproofing they did gives us peace of mind. Excellent work!',
    date: '3 weeks ago',
  },
]
