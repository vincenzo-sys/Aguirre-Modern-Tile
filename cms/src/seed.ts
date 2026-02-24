import { getPayload } from 'payload'
import config from '@payload-config'

async function seed() {
  const payload = await getPayload({ config })

  console.log('Seeding Payload CMS...')

  // --- Services ---
  const serviceData = [
    {
      title: 'Bathroom Tile Installation',
      slug: 'bathroom-tile',
      description: 'Complete bathroom transformations with expert waterproofing and precision tile work. From floors to walls, we handle it all.',
      heroDescription: 'Complete bathroom transformations with expert waterproofing and precision tile work. From simple updates to full renovations, we handle it all.',
      icon: 'Home',
      image: '/images/bathroom-service1.jpg',
      features: [
        { feature: 'Full bathroom remodels' },
        { feature: 'Custom shower niches' },
        { feature: 'Heated floor compatible' },
        { feature: 'Waterproof systems' },
        { feature: 'Complete bathroom renovations' },
        { feature: 'Custom shower builds' },
        { feature: 'Heated floor installation' },
        { feature: 'Waterproof membrane systems' },
        { feature: 'Niche and bench construction' },
        { feature: 'Tub surrounds' },
        { feature: 'Vanity backsplashes' },
        { feature: 'Floor-to-ceiling tile' },
      ],
      processSteps: [
        { title: 'Consultation & Estimate', description: 'We review your photos, discuss your vision, and provide a detailed estimate.' },
        { title: 'Demolition & Prep', description: 'Remove old materials, repair substrate, and install waterproof backing.' },
        { title: 'Waterproofing', description: 'Apply KERDI or GO-BOARD systems to create a fully waterproof envelope.' },
        { title: 'Tile Installation', description: 'Expert installation with proper thinset coverage, level lines, and clean cuts.' },
        { title: 'Grouting & Sealing', description: 'Professional grout application and sealing for a finished, durable result.' },
        { title: 'Final Walkthrough', description: 'We review every detail with you and ensure complete satisfaction.' },
      ],
      galleryImages: [
        { image: '/images/bathroom-service1.jpg', alt: 'Bathroom tile installation' },
        { image: '/images/bathroom-service2.jpg', alt: 'Bathroom tile work' },
        { image: '/images/bathroom-service3.jpg', alt: 'Bathroom project' },
      ],
      priceRange: '$4,500 - $15,000+',
      metaTitle: 'Bathroom Tile Installation | Aguirre Modern Tile',
      metaDescription: 'Expert bathroom tile installation in Greater Boston. Complete bathroom renovations with waterproof systems, custom showers, and heated floors.',
      sortOrder: 1,
    },
    {
      title: 'Shower Tile Installation',
      slug: 'shower-tile',
      description: 'Waterproof shower systems built to last. We specialize in KERDI-BOARD and GO-BOARD installations for leak-free showers.',
      heroDescription: 'Custom shower builds with the best waterproofing systems in the industry. Every shower we build is 100% leak-proof guaranteed.',
      icon: 'Droplets',
      image: '/images/shower1.jpg',
      features: [
        { feature: 'KERDI-BOARD systems' },
        { feature: 'Linear drain installation' },
        { feature: 'Custom bench seating' },
        { feature: 'Glass tile work' },
      ],
      processSteps: [
        { title: 'Design Consultation', description: 'Discuss layout, tile selection, and waterproofing approach.' },
        { title: 'Demolition', description: 'Remove existing shower and prepare the space.' },
        { title: 'Waterproofing', description: 'Install KERDI-BOARD or GO-BOARD for complete waterproofing.' },
        { title: 'Tile Installation', description: 'Precision tile work with proper slope for drainage.' },
        { title: 'Grouting & Finishing', description: 'Seal and finish for a beautiful, lasting result.' },
      ],
      galleryImages: [
        { image: '/images/shower1.jpg', alt: 'Shower tile installation' },
        { image: '/images/gallery1.jpg', alt: 'Shower project' },
        { image: '/images/gallery2.jpg', alt: 'Custom shower' },
      ],
      priceRange: '$2,500 - $8,000+',
      metaTitle: 'Shower Tile Installation | Aguirre Modern Tile',
      metaDescription: 'Expert shower tile installation in Greater Boston. KERDI-BOARD and GO-BOARD waterproof systems, custom designs, and professional installation.',
      sortOrder: 2,
    },
    {
      title: 'Floor Tile Installation',
      slug: 'floor-tile',
      description: 'Beautiful, durable tile floors for any room. We work with all tile sizes and materials, including large format tiles.',
      heroDescription: 'Durable, beautiful tile floors installed with precision. We handle everything from prep to polish, including large format tiles and heated floors.',
      icon: 'Grid3X3',
      image: '/images/floor1.jpg',
      features: [
        { feature: 'Large format tiles' },
        { feature: 'Pattern installations' },
        { feature: 'Heated floor systems' },
        { feature: 'Level substrate prep' },
      ],
      processSteps: [
        { title: 'Measurement & Planning', description: 'Measure space, plan layout, and order materials.' },
        { title: 'Subfloor Preparation', description: 'Level, repair, and prepare the substrate.' },
        { title: 'Tile Layout', description: 'Dry-lay tiles to plan cuts and pattern.' },
        { title: 'Installation', description: 'Set tiles with proper thinset and spacing.' },
        { title: 'Grouting & Sealing', description: 'Apply grout and sealant for a finished look.' },
      ],
      galleryImages: [
        { image: '/images/floor1.jpg', alt: 'Floor tile installation' },
        { image: '/images/floor2.jpg', alt: 'Floor tile work' },
        { image: '/images/floor3.jpg', alt: 'Floor project' },
      ],
      priceRange: '$1,500 - $6,000+',
      metaTitle: 'Floor Tile Installation | Aguirre Modern Tile',
      metaDescription: 'Professional floor tile installation in Greater Boston. Ceramic, porcelain, natural stone, and large format tile floors.',
      sortOrder: 3,
    },
    {
      title: 'Backsplash Installation',
      slug: 'backsplash-tile',
      description: 'Transform your kitchen or bathroom with a stunning backsplash. From subway tile to intricate mosaics.',
      heroDescription: 'Kitchen and bathroom backsplashes that add style and value. We handle everything from layout to grouting for a perfect finish.',
      icon: 'Wrench',
      image: '/images/backsplash1.jpg',
      features: [
        { feature: 'Kitchen backsplashes' },
        { feature: 'Bathroom backsplashes' },
        { feature: 'Custom patterns' },
        { feature: 'Behind-stove installations' },
      ],
      processSteps: [
        { title: 'Design & Material Selection', description: 'Choose tile style, pattern, and layout.' },
        { title: 'Surface Preparation', description: 'Clean and prep the wall surface.' },
        { title: 'Layout & Installation', description: 'Set tiles with precision alignment.' },
        { title: 'Grouting & Cleanup', description: 'Apply grout and clean for a polished finish.' },
      ],
      galleryImages: [
        { image: '/images/backsplash1.jpg', alt: 'Backsplash tile installation' },
        { image: '/images/backsplash2.jpg', alt: 'Kitchen backsplash' },
        { image: '/images/backsplash3.jpg', alt: 'Backsplash tile work' },
      ],
      priceRange: '$800 - $3,000+',
      metaTitle: 'Backsplash Tile Installation | Aguirre Modern Tile',
      metaDescription: 'Expert kitchen backsplash tile installation in Greater Boston. Subway tile, mosaic, and custom backsplash designs.',
      sortOrder: 4,
    },
    {
      title: 'Tile Repair',
      slug: 'tile-repair',
      description: 'Fix cracked, loose, or damaged tiles without replacing the entire installation. Expert matching and repairs.',
      heroDescription: 'Professional tile repair services. We fix cracked, chipped, or loose tiles and restore grout to like-new condition.',
      icon: 'Hammer',
      image: '/images/repair1.jpg',
      features: [
        { feature: 'Cracked tile replacement' },
        { feature: 'Loose tile repair' },
        { feature: 'Grout repair' },
        { feature: 'Color matching' },
      ],
      processSteps: [
        { title: 'Assessment', description: 'Inspect damage and determine the best repair approach.' },
        { title: 'Tile Removal', description: 'Carefully remove damaged tiles without affecting surrounding ones.' },
        { title: 'Surface Prep', description: 'Clean and prepare the substrate.' },
        { title: 'Replacement & Grouting', description: 'Install new tiles and match grout color.' },
      ],
      galleryImages: [
        { image: '/images/repair1.jpg', alt: 'Tile repair' },
        { image: '/images/repair2.jpg', alt: 'Tile repair work' },
        { image: '/images/repair3.jpg', alt: 'Repair project' },
      ],
      priceRange: '$200 - $1,500+',
      metaTitle: 'Tile Repair Services | Aguirre Modern Tile',
      metaDescription: 'Professional tile repair in Greater Boston. Fix cracked, chipped, or loose tiles. Grout repair and regrouting.',
      sortOrder: 5,
    },
    {
      title: 'Tile Reglazing',
      slug: 'tile-reglazing',
      description: 'Refresh your existing tile with professional reglazing. A cost-effective way to update your space.',
      heroDescription: 'Give your existing tile a brand-new look without the cost of replacement. Professional reglazing for bathtubs, showers, and tile surfaces.',
      icon: 'Sparkles',
      image: '/images/bathroom1.jpg',
      features: [
        { feature: 'Color change options' },
        { feature: 'Bathtub reglazing' },
        { feature: 'Sink reglazing' },
        { feature: 'Tile resurfacing' },
      ],
      processSteps: [
        { title: 'Surface Assessment', description: 'Evaluate condition and discuss color options.' },
        { title: 'Cleaning & Prep', description: 'Deep clean and prepare surfaces for reglazing.' },
        { title: 'Application', description: 'Apply professional-grade coating.' },
        { title: 'Curing & Inspection', description: 'Allow proper curing time and final inspection.' },
      ],
      galleryImages: [
        { image: '/images/bathroom1.jpg', alt: 'Tile reglazing' },
        { image: '/images/bathroom3.jpg', alt: 'Reglazing project' },
        { image: '/images/bathroom-service1.jpg', alt: 'Reglazing work' },
      ],
      priceRange: '$500 - $2,000+',
      metaTitle: 'Tile Reglazing Services | Aguirre Modern Tile',
      metaDescription: 'Professional tile reglazing and refinishing in Greater Boston. Restore your bathtub, shower, and tile surfaces.',
      sortOrder: 6,
    },
  ]

  for (const service of serviceData) {
    await payload.create({ collection: 'services', data: service })
  }
  console.log(`  Created ${serviceData.length} services`)

  // --- Testimonials ---
  const testimonialData = [
    {
      name: 'Sarah M.',
      location: 'Cambridge, MA',
      rating: 5,
      text: 'Christian and his team did an amazing job on our master bathroom. The attention to detail and communication throughout the project was exceptional.',
      project: 'Bathroom Renovation',
      featured: true,
    },
    {
      name: 'Mike P.',
      location: 'Boston, MA',
      rating: 5,
      text: 'From the virtual estimate to the final walkthrough, everything was professional. They showed up on time every day and left the workspace clean.',
      project: 'Shower Remodel',
      featured: true,
    },
    {
      name: 'Jennifer L.',
      location: 'Somerville, MA',
      rating: 5,
      text: "Best contractor experience we've ever had. Fair pricing, beautiful work, and they actually answer the phone! Highly recommend.",
      project: 'Kitchen Backsplash',
      featured: true,
    },
  ]

  for (const testimonial of testimonialData) {
    await payload.create({ collection: 'testimonials', data: testimonial })
  }
  console.log(`  Created ${testimonialData.length} testimonials`)

  // --- Gallery Projects ---
  const galleryData = [
    { title: 'Modern White Subway Bathroom', image: '/images/gallery/bathroom-1.jpg', category: 'Bathroom' as const },
    { title: 'Gray Marble Master Bath', image: '/images/gallery/bathroom-2.jpg', category: 'Bathroom' as const },
    { title: 'Herringbone Floor Bathroom', image: '/images/gallery/bathroom-3.jpg', category: 'Bathroom' as const },
    { title: 'Spa-Style Bathroom', image: '/images/gallery/bathroom-4.jpg', category: 'Bathroom' as const },
    { title: 'Classic Subway Tile Bathroom', image: '/images/gallery/bathroom-5.jpg', category: 'Bathroom' as const },
    { title: 'Large Format Wall Tile', image: '/images/gallery/bathroom-6.jpg', category: 'Bathroom' as const },
    { title: 'Modern Floating Vanity Bath', image: '/images/gallery/bathroom-7.jpg', category: 'Bathroom' as const },
    { title: 'Walk-In Shower with Niche', image: '/images/gallery/shower-1.jpg', category: 'Shower' as const },
    { title: 'Frameless Glass Shower', image: '/images/gallery/shower-2.jpg', category: 'Shower' as const },
    { title: 'Porcelain Kitchen Floor', image: '/images/gallery/floor-1.jpg', category: 'Floor' as const },
    { title: 'Wood-Look Tile Floor', image: '/images/gallery/floor-2.jpg', category: 'Floor' as const },
    { title: 'Large Format Living Room', image: '/images/gallery/floor-3.jpg', category: 'Floor' as const },
    { title: 'Entryway Mosaic Floor', image: '/images/gallery/floor-4.jpg', category: 'Floor' as const },
    { title: 'Herringbone Mudroom Floor', image: '/images/gallery/floor-5.jpg', category: 'Floor' as const },
    { title: 'Hexagon Bathroom Floor', image: '/images/gallery/floor-6.jpg', category: 'Floor' as const },
    { title: 'Marble Chevron Floor', image: '/images/gallery/floor-7.jpg', category: 'Floor' as const },
    { title: 'Basketweave Entry Floor', image: '/images/gallery/floor-8.jpg', category: 'Floor' as const },
    { title: 'Subway Tile Kitchen Backsplash', image: '/images/gallery/backsplash-1.jpg', category: 'Backsplash' as const },
    { title: 'Herringbone Marble Backsplash', image: '/images/gallery/backsplash-2.jpg', category: 'Backsplash' as const },
    { title: 'Mosaic Feature Backsplash', image: '/images/gallery/backsplash-3.jpg', category: 'Backsplash' as const },
    { title: 'Zellige Tile Backsplash', image: '/images/gallery/backsplash-4.jpg', category: 'Backsplash' as const },
    { title: 'Glass Mosaic Backsplash', image: '/images/gallery/backsplash-5.jpg', category: 'Backsplash' as const },
    { title: 'Penny Round Backsplash', image: '/images/gallery/backsplash-6.jpg', category: 'Backsplash' as const },
    { title: 'Large Format Backsplash', image: '/images/gallery/backsplash-7.jpg', category: 'Backsplash' as const },
    { title: 'Stacked Bond Backsplash', image: '/images/gallery/backsplash-8.jpg', category: 'Backsplash' as const },
    { title: 'Arabesque Tile Backsplash', image: '/images/gallery/backsplash-9.jpg', category: 'Backsplash' as const },
    { title: 'Picket Tile Backsplash', image: '/images/gallery/backsplash-10.jpg', category: 'Backsplash' as const },
    { title: 'Cracked Floor Tile Repair', image: '/images/gallery/repair-1.jpg', category: 'Repair' as const },
    { title: 'Shower Grout Restoration', image: '/images/gallery/repair-2.jpg', category: 'Repair' as const },
    { title: 'Threshold Tile Repair', image: '/images/gallery/repair-3.jpg', category: 'Repair' as const },
    { title: 'Bathroom Tile Patch', image: '/images/gallery/repair-4.jpg', category: 'Repair' as const },
    { title: 'Kitchen Floor Tile Fix', image: '/images/gallery/repair-5.jpg', category: 'Repair' as const },
    { title: 'Bathtub Reglazing', image: '/images/gallery/reglazing-1.jpg', category: 'Reglazing' as const },
    { title: 'Shower Tile Reglazing', image: '/images/gallery/reglazing-2.jpg', category: 'Reglazing' as const },
    { title: 'Bathroom Sink Reglazing', image: '/images/gallery/reglazing-3.jpg', category: 'Reglazing' as const },
    { title: 'Floor Tile Refinishing', image: '/images/gallery/reglazing-4.jpg', category: 'Reglazing' as const },
    { title: 'Vanity Top Reglazing', image: '/images/gallery/reglazing-5.jpg', category: 'Reglazing' as const },
    { title: 'Steam Shower Build', image: '/images/gallery/other-1.jpg', category: 'Other' as const },
    { title: 'Outdoor Patio Tile', image: '/images/gallery/other-2.jpg', category: 'Other' as const },
    { title: 'Fireplace Surround', image: '/images/gallery/other-3.jpg', category: 'Other' as const },
    { title: 'Laundry Room Floor', image: '/images/gallery/other-4.jpg', category: 'Other' as const },
    { title: 'Pool House Tile', image: '/images/gallery/other-5.jpg', category: 'Other' as const },
    { title: 'Accent Wall Installation', image: '/images/gallery/other-6.jpg', category: 'Other' as const },
    { title: 'Mudroom Floor Tile', image: '/images/gallery/other-7.jpg', category: 'Other' as const },
    { title: 'Wet Bar Backsplash', image: '/images/gallery/other-8.jpg', category: 'Other' as const },
    { title: 'Sunroom Floor Tile', image: '/images/gallery/other-9.jpg', category: 'Other' as const },
  ]

  for (let i = 0; i < galleryData.length; i++) {
    await payload.create({ collection: 'gallery-projects', data: { ...galleryData[i], sortOrder: i + 1 } })
  }
  console.log(`  Created ${galleryData.length} gallery projects`)

  // --- Team Members ---
  const teamData = [
    {
      name: 'Christian Aguirre',
      role: 'Founder & Lead Installer',
      bio: 'With over 15 years of experience in tile installation, Christian founded Aguirre Modern Tile with a simple mission: deliver the highest quality tile work in Greater Boston. He personally oversees every project to ensure it meets his exacting standards.',
      highlights: [
        { highlight: '15+ years tile installation experience' },
        { highlight: 'KERDI-BOARD and GO-BOARD certified' },
        { highlight: 'Personally oversees every project' },
      ],
      sortOrder: 1,
    },
    {
      name: 'Vin Aguirre',
      role: 'Operations & Customer Relations',
      bio: "Vin handles the business side so Christian can focus on what he does best — beautiful tile work. From your first call to project completion, Vin ensures every customer has an exceptional experience. He's the one who answers within 5 minutes.",
      highlights: [
        { highlight: 'Answers calls within 5 minutes' },
        { highlight: 'Coordinates all project scheduling' },
        { highlight: 'Handles estimates and proposals' },
      ],
      sortOrder: 2,
    },
  ]

  for (const member of teamData) {
    await payload.create({ collection: 'team-members', data: member })
  }
  console.log(`  Created ${teamData.length} team members`)

  // --- FAQs ---
  const faqData = [
    {
      question: 'How quickly can you start my project?',
      answer: "Most projects can be scheduled within 1-2 weeks. For urgent repairs, we often have same-week availability. We'll give you a specific timeline during your estimate.",
      category: 'general' as const,
      sortOrder: 1,
    },
    {
      question: 'Do you offer free estimates?',
      answer: 'Yes! We provide free virtual estimates — just send us photos and measurements, and we\'ll have a detailed quote for you within 24 hours. We can also do in-person estimates for larger projects.',
      category: 'pricing' as const,
      sortOrder: 2,
    },
    {
      question: 'What areas do you serve?',
      answer: 'We serve the entire Greater Boston area including Revere, Boston, Cambridge, Somerville, Brookline, and surrounding communities within about 30 miles of Boston.',
      category: 'general' as const,
      sortOrder: 3,
    },
    {
      question: 'Are you licensed and insured?',
      answer: 'Yes, we are fully licensed and insured. We carry comprehensive general liability insurance and workers\' compensation coverage for your complete protection.',
      category: 'general' as const,
      sortOrder: 4,
    },
  ]

  for (const faq of faqData) {
    await payload.create({ collection: 'faqs', data: faq })
  }
  console.log(`  Created ${faqData.length} FAQs`)

  // --- Blog Posts ---
  // Helper to create Lexical paragraph nodes
  const p = (text: string) => ({
    type: 'paragraph',
    children: [{ type: 'text', text, version: 1 }],
    version: 1,
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
    textFormat: 0,
    textStyle: '',
  })

  const h2 = (text: string) => ({
    type: 'heading',
    tag: 'h2',
    children: [{ type: 'text', text, version: 1 }],
    version: 1,
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
  })

  const h3 = (text: string) => ({
    type: 'heading',
    tag: 'h3',
    children: [{ type: 'text', text, version: 1 }],
    version: 1,
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
  })

  const blogData = [
    {
      title: '5 Signs Your Shower Needs Waterproofing',
      slug: 'shower-waterproofing-signs',
      excerpt: 'Catching waterproofing issues early can save you thousands. Here are the warning signs every homeowner should know before water damage becomes a costly problem.',
      content: {
        root: {
          type: 'root',
          children: [
            p('Your shower might look fine on the surface, but hidden moisture problems can cause thousands of dollars in damage if left unchecked. After 15+ years of tile installation in Greater Boston, we\'ve seen it all. Here are the five warning signs that your shower needs professional waterproofing.'),
            h2('1. Loose or Hollow-Sounding Tiles'),
            p('Tap your shower tiles gently. If they sound hollow instead of solid, water may have gotten behind them and broken the bond with the substrate. This is one of the earliest warning signs.'),
            h2('2. Crumbling or Missing Grout'),
            p('Grout that\'s cracking, falling out, or turning dark in spots isn\'t just cosmetic — it\'s letting water through. While regrouting helps short-term, it may indicate the underlying waterproofing has failed.'),
            h2('3. Stains on the Ceiling Below'),
            p('If you have a bathroom above another room, water stains on the ceiling below are a clear sign of a leak. Don\'t wait — this means water is actively penetrating through the floor.'),
            h2('4. Musty Smell That Won\'t Go Away'),
            p('A persistent musty or moldy smell in your bathroom, even after cleaning, often means moisture is trapped behind walls or under the floor. This is a health concern as well as a structural one.'),
            h2('5. Soft or Spongy Spots on the Floor'),
            p('If the floor near your shower feels soft when you step on it, the subfloor may be rotting from water exposure. This requires immediate attention.'),
            h2('What to Do Next'),
            p('If you\'re seeing any of these signs, don\'t panic — but don\'t wait either. A professional assessment can determine the extent of the damage and the best repair approach. At Aguirre Modern Tile, we use KERDI-BOARD and GO-BOARD waterproofing systems that provide a complete moisture barrier, protecting your home for 20+ years.'),
            p('Contact us for a free estimate — send photos and we\'ll assess your situation within 24 hours.'),
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
        },
      },
      featuredImage: '/images/shower1.jpg',
      author: 'Christian Aguirre',
      category: 'tips',
      tags: [{ tag: 'waterproofing' }, { tag: 'showers' }, { tag: 'maintenance' }],
      publishedAt: '2024-11-15',
      status: 'published',
      metaTitle: '5 Signs Your Shower Needs Waterproofing | Aguirre Modern Tile',
      metaDescription: 'Learn the warning signs that your shower waterproofing has failed. Expert advice from 15+ years of tile installation in Greater Boston.',
    },
    {
      title: 'KERDI-BOARD vs GO-BOARD: Which Is Right for Your Shower?',
      slug: 'kerdi-board-vs-go-board',
      excerpt: 'Both are excellent waterproofing systems, but each has strengths. We break down the pros and cons so you can make the right choice for your project.',
      content: {
        root: {
          type: 'root',
          children: [
            p('When it comes to waterproofing your shower, two products dominate the professional market: Schluter KERDI-BOARD and Johns Manville GO-BOARD. We\'ve installed hundreds of showers with both systems, so here\'s our honest comparison.'),
            h2('KERDI-BOARD (Schluter Systems)'),
            p('KERDI-BOARD is an extruded polystyrene foam panel with a fleece webbing on both sides. It\'s been the industry standard for years.'),
            h3('Pros'),
            p('Complete system with matching drains, niches, and accessories. Excellent warranty when using all Schluter components. Widely available at specialty tile shops. Proven track record over decades.'),
            h3('Cons'),
            p('More expensive overall (system approach means all Schluter). Requires Schluter-specific thin-set for full warranty. Panels can be fragile during transport.'),
            h2('GO-BOARD (Johns Manville)'),
            p('GO-BOARD is a newer competitor made from extruded polystyrene with a cementitious coating. It\'s gaining popularity fast.'),
            h3('Pros'),
            p('Works with any modified thin-set (no proprietary requirement). Slightly more affordable per square foot. More rigid than KERDI-BOARD — easier to handle. Integrated waterproofing — no separate membrane needed.'),
            h3('Cons'),
            p('Smaller accessory ecosystem. Less brand recognition (though growing fast). Fewer integrated system components.'),
            h2('Our Recommendation'),
            p('For most homeowners, both systems deliver excellent results. We typically recommend KERDI-BOARD for complex custom showers where the full system integration matters, and GO-BOARD for straightforward shower builds where cost savings are a priority.'),
            p('The most important thing isn\'t which board you choose — it\'s that your installer uses proper waterproofing in the first place. Too many contractors skip this step entirely, leading to costly failures down the road.'),
            p('Want to discuss which system is right for your project? Contact us for a free consultation.'),
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
        },
      },
      featuredImage: '/images/bathroom-service1.jpg',
      author: 'Christian Aguirre',
      category: 'tips',
      tags: [{ tag: 'waterproofing' }, { tag: 'KERDI-BOARD' }, { tag: 'GO-BOARD' }, { tag: 'materials' }],
      publishedAt: '2024-10-22',
      status: 'published',
      metaTitle: 'KERDI-BOARD vs GO-BOARD Comparison | Aguirre Modern Tile',
      metaDescription: 'Honest comparison of KERDI-BOARD and GO-BOARD waterproofing systems from a professional tile installer with 15+ years of experience.',
    },
    {
      title: 'Cambridge Master Bath Transformation',
      slug: 'cambridge-master-bath-transformation',
      excerpt: 'See how we transformed a dated 1990s master bathroom into a modern spa-like retreat with large format porcelain, a curbless shower, and heated floors.',
      content: {
        root: {
          type: 'root',
          children: [
            p('This Cambridge homeowner came to us with a common problem: a 1990s master bathroom that was functional but dated. Beige 4x4 tiles, a prefab shower insert, and vinyl flooring. They wanted a complete transformation into a modern, spa-like retreat.'),
            h2('The Vision'),
            p('The homeowner wanted a curbless walk-in shower with a linear drain, large format porcelain tiles (24x48) throughout, a built-in shower niche for storage, heated floors under the tile, and a clean, modern aesthetic with warm gray tones.'),
            h2('Week 1 — Demolition and Prep'),
            p('We removed everything down to the studs and subfloor. This revealed some water damage around the old shower pan — no waterproofing membrane had been installed originally, a common issue in 1990s construction.'),
            h2('Week 2 — Waterproofing and Systems'),
            p('We installed KERDI-BOARD throughout the shower area, creating a complete waterproof envelope. The heated floor system was laid out and tested before any tile went down.'),
            h2('Week 3 — Tile Installation'),
            p('The large format tiles required careful planning for layout and cuts. We used a leveling system to ensure perfectly flat walls and consistent grout lines throughout.'),
            h2('Week 4 — Finishing'),
            p('Grouting, sealing, fixtures, and glass shower door installation. The linear drain was integrated seamlessly into the floor slope.'),
            h2('The Result'),
            p('The finished bathroom is barely recognizable. The large format tiles create a sense of spaciousness, the curbless shower makes the room feel even bigger, and the heated floors are a luxury the homeowner says they can\'t live without.'),
            p('Total project time: 4 weeks. Investment: $14,500 (including all materials and labor).'),
            p('Thinking about transforming your bathroom? Send us photos and we\'ll provide a free estimate within 24 hours.'),
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
        },
      },
      featuredImage: '/images/bathroom-service2.jpg',
      author: 'Christian Aguirre',
      category: 'spotlight',
      tags: [{ tag: 'bathroom' }, { tag: 'renovation' }, { tag: 'Cambridge' }, { tag: 'large format' }],
      publishedAt: '2024-09-18',
      status: 'published',
      metaTitle: 'Cambridge Master Bath Transformation | Aguirre Modern Tile',
      metaDescription: 'See how we transformed a dated 1990s master bathroom into a modern spa retreat with large format tile, curbless shower, and heated floors.',
    },
    {
      title: '2024 Tile Trends: What We\'re Seeing in Greater Boston',
      slug: '2024-tile-trends-boston',
      excerpt: 'From zellige to large format slabs, here are the tile trends dominating Greater Boston renovations this year — and which ones are worth the investment.',
      content: {
        root: {
          type: 'root',
          children: [
            p('After completing over 220 bathroom projects this year alone, we have a pretty good pulse on what Greater Boston homeowners are choosing. Here are the tile trends we\'re seeing the most — and our take on which ones are worth the investment.'),
            h2('1. Large Format Tiles (24x48 and Bigger)'),
            p('The biggest trend by far. Large format tiles create a seamless, modern look with fewer grout lines. They work beautifully on floors and shower walls. The catch: they require a perfectly level substrate and an experienced installer. We love them.'),
            h2('2. Zellige and Handmade-Look Tiles'),
            p('Zellige tiles from Morocco (and zellige-inspired tiles) are everywhere. Their slightly imperfect, handmade quality adds warmth and character to kitchens and bathrooms. They\'re pricier than standard tiles but make a stunning statement.'),
            h2('3. Wood-Look Porcelain Planks'),
            p('Wood-look tiles have been popular for years, but the technology keeps getting better. Today\'s porcelain planks are nearly indistinguishable from real hardwood, with the durability and water resistance of tile.'),
            h2('4. Matte Finishes Over Glossy'),
            p('The shiny, glossy tile look is fading. Boston homeowners are overwhelmingly choosing matte and satin finishes for a more sophisticated, contemporary feel. Bonus: matte tiles hide water spots and fingerprints better.'),
            h2('5. Bold Patterns in Small Spaces'),
            p('Powder rooms and laundry rooms are becoming design showcases. We\'re seeing bold geometric patterns, colorful cement tiles, and dramatic mosaic floors in these smaller spaces where homeowners feel free to take risks.'),
            h2('Our Advice'),
            p('Trends come and go, but quality installation lasts forever. Whatever tile style you choose, make sure it\'s installed with proper waterproofing, full thinset coverage, and attention to detail. That\'s what we do at Aguirre Modern Tile — beautiful installations that last.'),
            p('Ready to start your tile project? Get a free estimate today.'),
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
        },
      },
      featuredImage: '/images/backsplash1.jpg',
      author: 'Christian Aguirre',
      category: 'news',
      tags: [{ tag: 'trends' }, { tag: '2024' }, { tag: 'design' }, { tag: 'Boston' }],
      publishedAt: '2024-08-05',
      status: 'published',
      metaTitle: '2024 Tile Trends in Greater Boston | Aguirre Modern Tile',
      metaDescription: 'Top tile trends for 2024 in Greater Boston: large format, zellige, wood-look planks, matte finishes, and bold patterns.',
    },
  ]

  for (const post of blogData) {
    await payload.create({ collection: 'blog-posts', data: post })
  }
  console.log(`  Created ${blogData.length} blog posts`)

  // --- Company Info Global ---
  await payload.updateGlobal({
    slug: 'company-info',
    data: {
      companyName: 'Aguirre Modern Tile',
      tagline: 'Expert Tile Installation',
      phone: '(617) 766-1259',
      email: 'vin@moderntile.pro',
      address: '106 Pemberton St, Revere, MA 02151',
      hours: {
        weekday: 'Monday-Friday: 7:00 AM - 6:00 PM',
        saturday: 'Saturday: 8:00 AM - 4:00 PM',
        sunday: 'Sunday: Closed (emergencies only)',
        shortDisplay: 'Mon-Sat: 7AM - 6PM',
      },
      stats: {
        yearsExperience: '15+',
        bathroomsPerYear: '220+',
        googleRating: '4.9',
        reviewCount: '150+',
        responseTime: '5 minutes',
      },
      values: [
        { title: 'Quality First', description: 'Proper waterproofing, full thinset coverage, level surfaces, and clean cuts on every single job.' },
        { title: 'Clear Communication', description: 'We answer in 5 minutes, provide same-day estimates, and keep you updated throughout your project.' },
        { title: 'Fair Pricing', description: 'Transparent pricing with no hidden fees. We stand behind our quotes — the price we give is the price you pay.' },
      ],
      story: "Aguirre Modern Tile was founded over 15 years ago with a simple mission: deliver the highest quality tile work in Greater Boston at fair, transparent prices. What started as a one-man operation has grown into a trusted team, but our commitment to quality and customer service hasn't changed. Every project gets the same attention to detail — because your home deserves it.",
      licenses: {
        hicNumber: '#000000',
        liabilityCoverage: '$1M',
      },
      description: 'Professional tile installation in Greater Boston for over 15 years. Bathroom renovations, shower builds, floor tile, backsplash, and repair.',
    },
  })
  console.log('  Updated company-info global')

  // --- Homepage Global ---
  await payload.updateGlobal({
    slug: 'homepage',
    data: {
      hero: {
        title: 'Expert Tile Installation in Greater Boston',
        subtitle: 'Transforming homes with precision craftsmanship for 15+ years. We answer in 5 minutes and deliver same-day virtual estimates.',
        ctaPrimary: 'Get Your Free Estimate',
        ctaSecondary: 'Call Now: (617) 766-1259',
      },
      trustBar: [
        { label: 'Licensed', value: 'Licensed' },
        { label: 'Insured', value: 'Insured' },
        { label: 'Experience', value: '15+ Years Experience' },
        { label: 'Volume', value: '220+ Bathrooms/Year' },
      ],
      whyChooseUs: [
        { title: 'Quality Craftsmanship', description: 'Proper waterproofing, full thinset coverage, level surfaces, and clean cuts on every job.' },
        { title: 'Fast Response', description: 'We answer calls and messages within 5 minutes. Same-day estimates available.' },
        { title: '150+ 5-Star Reviews', description: 'Our customers love our work. Check out our Google reviews to see why.' },
      ],
      serviceAreas: [
        { city: 'Revere' }, { city: 'Boston' }, { city: 'Cambridge' }, { city: 'Somerville' },
        { city: 'Everett' }, { city: 'Chelsea' }, { city: 'Malden' }, { city: 'Medford' },
        { city: 'Melrose' }, { city: 'Lynn' }, { city: 'Saugus' }, { city: 'Winthrop' },
        { city: 'Brookline' }, { city: 'Arlington' }, { city: 'Belmont' }, { city: 'Watertown' },
        { city: 'Stoneham' }, { city: 'Wakefield' },
      ],
    },
  })
  console.log('  Updated homepage global')

  // --- Navigation Global ---
  await payload.updateGlobal({
    slug: 'navigation',
    data: {
      mainNav: [
        { label: 'Home', href: '/' },
        { label: 'Services', href: '/services' },
        { label: 'Our Process', href: '/process' },
        { label: 'Gallery', href: '/gallery' },
        { label: 'Blog', href: '/blog' },
        { label: 'About', href: '/about' },
        { label: 'Contact', href: '/contact' },
      ],
      footerServiceAreas: [
        { city: 'Revere' }, { city: 'Boston' }, { city: 'Cambridge' }, { city: 'Somerville' },
        { city: 'Everett' }, { city: 'Chelsea' }, { city: 'Malden' }, { city: 'Medford' },
        { city: 'Melrose' }, { city: 'Lynn' }, { city: 'Saugus' }, { city: 'Winthrop' },
        { city: 'Brookline' }, { city: 'Arlington' }, { city: 'Belmont' }, { city: 'Watertown' },
      ],
      footerLinks: [
        { label: 'Privacy Policy', href: '/privacy' },
        { label: 'Terms of Service', href: '/terms' },
      ],
    },
  })
  console.log('  Updated navigation global')

  console.log('Seeding complete!')
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seeding failed:', err)
  process.exit(1)
})
