import type { CollectionConfig } from 'payload'

export const Services: CollectionConfig = {
  slug: 'services',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'priceRange'],
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'URL slug, e.g. "bathroom-tile"',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      required: true,
    },
    {
      name: 'heroDescription',
      type: 'textarea',
      admin: {
        description: 'Longer description for the individual service page hero',
      },
    },
    {
      name: 'icon',
      type: 'text',
      admin: {
        description: 'Lucide icon name, e.g. "Bath", "ShowerHead"',
      },
    },
    {
      name: 'image',
      type: 'text',
      admin: {
        description: 'Image path, e.g. "/images/bathroom-service1.jpg"',
      },
    },
    {
      name: 'features',
      type: 'array',
      fields: [
        {
          name: 'feature',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      name: 'processSteps',
      type: 'array',
      admin: {
        description: 'Step-by-step process for the individual service page',
      },
      fields: [
        {
          name: 'title',
          type: 'text',
          required: true,
        },
        {
          name: 'description',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      name: 'priceRange',
      type: 'text',
      admin: {
        description: 'e.g. "$4,500 - $15,000+"',
      },
    },
    {
      name: 'galleryImages',
      type: 'array',
      admin: {
        description: 'Gallery images shown on the individual service page',
      },
      fields: [
        {
          name: 'image',
          type: 'text',
          required: true,
          admin: {
            description: 'Image path, e.g. "/images/shower1.jpg"',
          },
        },
        {
          name: 'alt',
          type: 'text',
          admin: {
            description: 'Alt text for the image',
          },
        },
      ],
    },
    {
      name: 'metaTitle',
      type: 'text',
    },
    {
      name: 'metaDescription',
      type: 'textarea',
    },
    {
      name: 'sortOrder',
      type: 'number',
      defaultValue: 0,
      admin: {
        description: 'Lower numbers appear first',
      },
    },
  ],
}
