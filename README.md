# Aguirre Modern Tile Website

A modern, conversion-focused website for Aguirre Modern Tile built with Next.js 14, Tailwind CSS, and TypeScript.

## Features

- **Modern Design**: Clean, professional design optimized for conversions
- **Mobile-First**: Fully responsive on all devices
- **Fast Performance**: Built with Next.js App Router for optimal loading
- **SEO Optimized**: Full meta tags and semantic HTML
- **Interactive Components**:
  - Quote Calculator
  - Before/After Image Slider
  - Photo Upload Form
  - Comparison Table

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Language**: TypeScript
- **Icons**: Lucide React
- **Utilities**: clsx

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn

### Installation

1. Navigate to the project directory:
   ```bash
   cd aguirre-modern-tile
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Building for Production

```bash
npm run build
npm start
```

## Project Structure

```
aguirre-modern-tile/
├── public/              # Static assets
│   └── images/          # Image files
├── src/
│   ├── app/             # Next.js App Router pages
│   │   ├── page.tsx     # Home page
│   │   ├── layout.tsx   # Root layout
│   │   ├── globals.css  # Global styles
│   │   ├── about/       # About page
│   │   ├── contact/     # Contact page
│   │   ├── gallery/     # Gallery page
│   │   ├── process/     # Our Process page
│   │   └── services/    # Service pages
│   │       ├── page.tsx
│   │       ├── bathroom-tile/
│   │       ├── shower-tile/
│   │       ├── floor-tile/
│   │       ├── backsplash-tile/
│   │       ├── tile-repair/
│   │       └── tile-reglazing/
│   └── components/      # Reusable components
│       ├── Header.tsx
│       ├── Footer.tsx
│       ├── QuoteCalculator.tsx
│       ├── BeforeAfterSlider.tsx
│       ├── PhotoUploadForm.tsx
│       └── ComparisonTable.tsx
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── README.md
```

## Pages

| Page | Path | Description |
|------|------|-------------|
| Home | `/` | Main landing page with hero, services, calculator |
| Services | `/services` | Overview of all services |
| Bathroom Tile | `/services/bathroom-tile` | Bathroom tile service details |
| Shower Tile | `/services/shower-tile` | Shower tile service details |
| Floor Tile | `/services/floor-tile` | Floor tile service details |
| Backsplash | `/services/backsplash-tile` | Backsplash service details |
| Tile Repair | `/services/tile-repair` | Repair service details |
| Tile Reglazing | `/services/tile-reglazing` | Reglazing service details |
| Our Process | `/process` | Technical deep dive on our methods |
| Gallery | `/gallery` | Portfolio with before/after photos |
| About | `/about` | Company info and team |
| Contact | `/contact` | Contact form with photo upload |

## Components

### QuoteCalculator
Interactive calculator that provides instant ballpark estimates based on:
- Project type (bathroom, shower, floor, backsplash)
- Size (small, medium, large)
- Complexity (standard, moderate, complex)
- Demo needed (yes/no)

### BeforeAfterSlider
Draggable slider component for before/after image comparisons.

### PhotoUploadForm
Contact form with drag-and-drop photo upload for project estimates.

### ComparisonTable
Side-by-side comparison of Aguirre Modern Tile vs typical contractors.

## Customization

### Colors
Edit `tailwind.config.js` to change the color scheme:
```js
theme: {
  extend: {
    colors: {
      primary: {
        // Your primary color scale
      }
    }
  }
}
```

### Content
- Update company info in `Footer.tsx` and throughout pages
- Add actual images to the `public/images` directory
- Update pricing in `QuoteCalculator.tsx`
- Connect the PhotoUploadForm to your backend/email service

## Deployment

This site can be deployed to:
- Vercel (recommended for Next.js)
- Netlify
- AWS Amplify
- Any platform supporting Node.js

### Vercel Deployment

```bash
npm i -g vercel
vercel
```

## TODO

- [ ] Add actual project images
- [ ] Connect photo upload form to backend
- [ ] Integrate Google Reviews API
- [ ] Add Google Analytics
- [ ] Set up contact form email notifications
- [ ] Add structured data (JSON-LD) for SEO
- [ ] Create remaining service pages with full content

## License

Proprietary - Aguirre Modern Tile

## Contact

- **Phone**: (617) 766-1259
- **Email**: vin@moderntile.pro
- **Address**: 106 Pemberton St, Revere, MA 02151
