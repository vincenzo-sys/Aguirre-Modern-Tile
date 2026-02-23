import type { GlobalConfig } from 'payload'

export const Homepage: GlobalConfig = {
  slug: 'homepage',
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'hero',
      type: 'group',
      fields: [
        {
          name: 'title',
          type: 'text',
          defaultValue: 'Expert Tile Installation in Greater Boston',
        },
        {
          name: 'subtitle',
          type: 'textarea',
          defaultValue: 'Transform your bathroom, shower, or kitchen with precision tile work. Licensed, insured, and trusted by 150+ homeowners.',
        },
        {
          name: 'ctaPrimary',
          type: 'text',
          defaultValue: 'Get Free Estimate',
        },
        {
          name: 'ctaSecondary',
          type: 'text',
          defaultValue: 'View Our Work',
        },
      ],
    },
    {
      name: 'trustBar',
      type: 'array',
      fields: [
        {
          name: 'label',
          type: 'text',
          required: true,
        },
        {
          name: 'value',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      name: 'whyChooseUs',
      type: 'array',
      fields: [
        {
          name: 'title',
          type: 'text',
          required: true,
        },
        {
          name: 'description',
          type: 'textarea',
          required: true,
        },
      ],
    },
    {
      name: 'serviceAreas',
      type: 'array',
      fields: [
        {
          name: 'city',
          type: 'text',
          required: true,
        },
      ],
    },
  ],
}
