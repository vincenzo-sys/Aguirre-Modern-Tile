import path from 'path'
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor, EXPERIMENTAL_TableFeature } from '@payloadcms/richtext-lexical'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Services } from './collections/Services'
import { Testimonials } from './collections/Testimonials'
import { GalleryProjects } from './collections/GalleryProjects'
import { TeamMembers } from './collections/TeamMembers'
import { FAQs } from './collections/FAQs'
import { BlogPosts } from './collections/BlogPosts'
import { Categories } from './collections/Categories'
import { Tags } from './collections/Tags'
import { ContentQueue } from './collections/ContentQueue'
import { CompanyInfo } from './globals/CompanyInfo'
import { Homepage } from './globals/Homepage'
import { Navigation } from './globals/Navigation'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const corsOrigins = [
  'http://localhost:3100',
  'http://localhost:3000',
  'http://localhost:3001',
  'https://aguirre-modern-tile.vercel.app',
  'https://aguirremoderntile.com',
  'https://www.aguirremoderntile.com',
  'https://cms.aguirremoderntile.com',
  'https://cms-azure-one.vercel.app',
]

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    meta: {
      titleSuffix: ' - Aguirre Modern Tile CMS',
    },
  },
  collections: [Users, Media, Services, Testimonials, GalleryProjects, TeamMembers, FAQs, BlogPosts, Categories, Tags, ContentQueue],
  globals: [CompanyInfo, Homepage, Navigation],
  editor: lexicalEditor({
    features: ({ defaultFeatures }) => [...defaultFeatures, EXPERIMENTAL_TableFeature()],
  }),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || '',
      ssl: (process.env.DATABASE_URI?.includes('supabase') || process.env.DATABASE_URI?.includes('pooler'))
        ? { rejectUnauthorized: false }
        : false,
    },
    schemaName: 'cms',
    push: process.env.NODE_ENV === 'development',
  }),
  cors: corsOrigins,
  csrf: corsOrigins,
  sharp,
  plugins: [
    vercelBlobStorage({
      enabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      collections: {
        media: true,
      },
      token: process.env.BLOB_READ_WRITE_TOKEN || '',
    }),
  ],
})
