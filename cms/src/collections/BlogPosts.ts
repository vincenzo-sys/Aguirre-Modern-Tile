import type { CollectionConfig } from 'payload'

export const BlogPosts: CollectionConfig = {
  slug: 'blog-posts',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'category', 'articleType', 'publishedAt'],
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      maxLength: 100,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        position: 'sidebar',
        description: 'Auto-generated from title if left empty',
      },
      hooks: {
        beforeValidate: [
          ({ value, data }) => {
            if (!value && data?.title) {
              return data.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)/g, '')
            }
            return value
          },
        ],
      },
    },
    {
      name: 'excerpt',
      type: 'textarea',
      required: true,
      maxLength: 300,
      admin: {
        description: 'Brief summary for SEO and blog listing cards (max 300 chars)',
      },
    },
    {
      name: 'featuredImage',
      type: 'upload',
      relationTo: 'media',
      required: false,
    },
    {
      name: 'content',
      type: 'richText',
      required: true,
    },
    {
      name: 'category',
      type: 'relationship',
      relationTo: 'categories',
      required: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'author',
      type: 'text',
      defaultValue: 'Christian Aguirre',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: {
        position: 'sidebar',
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    // Article type for SEO content strategy (hub-and-spoke)
    {
      name: 'articleType',
      type: 'select',
      index: true,
      options: [
        { label: 'Hub', value: 'hub' },
        { label: 'Pillar', value: 'pillar' },
        { label: 'Spoke', value: 'spoke' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Hub = main topic page, Pillar = subtopic, Spoke = individual article',
      },
    },
    {
      name: 'parentSlug',
      type: 'text',
      admin: {
        position: 'sidebar',
        description: 'Parent article slug (for pillars and spokes)',
      },
    },
    // Tile-specific fields
    {
      name: 'serviceType',
      type: 'select',
      options: [
        { label: 'Bathroom Tile', value: 'bathroom' },
        { label: 'Shower Tile', value: 'shower' },
        { label: 'Floor Tile', value: 'floor' },
        { label: 'Backsplash', value: 'backsplash' },
        { label: 'Tile Repair', value: 'repair' },
        { label: 'Tile Reglazing', value: 'reglazing' },
        { label: 'General', value: 'general' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Link to a specific service for CTA',
      },
    },
    // FAQ for schema markup
    {
      name: 'faqItems',
      type: 'array',
      admin: {
        description: 'FAQ items — renders as accordion and generates FAQPage schema markup',
      },
      fields: [
        {
          name: 'question',
          type: 'text',
          required: true,
        },
        {
          name: 'answer',
          type: 'textarea',
          required: true,
        },
      ],
    },
    // SEO overrides
    {
      name: 'seo',
      type: 'group',
      fields: [
        {
          name: 'metaTitle',
          type: 'text',
          maxLength: 60,
          admin: {
            description: 'Override title for search engines (max 60 chars)',
          },
        },
        {
          name: 'metaDescription',
          type: 'textarea',
          maxLength: 160,
          admin: {
            description: 'Description for search engines (max 160 chars)',
          },
        },
      ],
    },
  ],
}
