import path from 'path'
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { Users } from '@/collections/Users'
import { Media } from '@/collections/Media'
import { Services } from '@/collections/Services'
import { Testimonials } from '@/collections/Testimonials'
import { GalleryProjects } from '@/collections/GalleryProjects'
import { TeamMembers } from '@/collections/TeamMembers'
import { FAQs } from '@/collections/FAQs'
import { BlogPosts } from '@/collections/BlogPosts'
import { CompanyInfo } from '@/globals/CompanyInfo'
import { Homepage } from '@/globals/Homepage'
import { Navigation } from '@/globals/Navigation'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media, Services, Testimonials, GalleryProjects, TeamMembers, FAQs, BlogPosts],
  globals: [CompanyInfo, Homepage, Navigation],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || '',
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    },
    schemaName: 'cms',
  }),
  cors: [
    'http://localhost:3100',
    'http://localhost:3000',
    'https://aguirre-modern-tile.vercel.app',
  ],
  sharp,
})
