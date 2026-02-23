import type { GlobalConfig } from 'payload'

export const CompanyInfo: GlobalConfig = {
  slug: 'company-info',
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'companyName',
      type: 'text',
      required: true,
      defaultValue: 'Aguirre Modern Tile',
    },
    {
      name: 'tagline',
      type: 'text',
      defaultValue: 'Expert Tile Installation',
    },
    {
      name: 'phone',
      type: 'text',
      required: true,
      defaultValue: '(617) 766-1259',
    },
    {
      name: 'email',
      type: 'text',
      required: true,
      defaultValue: 'vin@moderntile.pro',
    },
    {
      name: 'address',
      type: 'text',
      defaultValue: '106 Pemberton St, Revere, MA 02151',
    },
    {
      name: 'hours',
      type: 'group',
      fields: [
        {
          name: 'weekday',
          type: 'text',
          defaultValue: 'Monday-Friday: 7:00 AM - 6:00 PM',
        },
        {
          name: 'saturday',
          type: 'text',
          defaultValue: 'Saturday: 8:00 AM - 4:00 PM',
        },
        {
          name: 'sunday',
          type: 'text',
          defaultValue: 'Sunday: Closed (emergencies only)',
        },
        {
          name: 'shortDisplay',
          type: 'text',
          defaultValue: 'Mon-Sat: 7AM - 6PM',
        },
      ],
    },
    {
      name: 'stats',
      type: 'group',
      fields: [
        {
          name: 'yearsExperience',
          type: 'text',
          defaultValue: '15+',
        },
        {
          name: 'bathroomsPerYear',
          type: 'text',
          defaultValue: '220+',
        },
        {
          name: 'googleRating',
          type: 'text',
          defaultValue: '4.9',
        },
        {
          name: 'reviewCount',
          type: 'text',
          defaultValue: '150+',
        },
        {
          name: 'responseTime',
          type: 'text',
          defaultValue: '5 minutes',
        },
      ],
    },
    {
      name: 'values',
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
      name: 'story',
      type: 'textarea',
      admin: {
        description: 'Company story text for the About page',
      },
    },
    {
      name: 'licenses',
      type: 'group',
      fields: [
        {
          name: 'hicNumber',
          type: 'text',
          defaultValue: '#000000',
        },
        {
          name: 'liabilityCoverage',
          type: 'text',
          defaultValue: '$1M',
        },
      ],
    },
    {
      name: 'description',
      type: 'textarea',
      admin: {
        description: 'Short company description for footer',
      },
      defaultValue: 'Professional tile installation in Greater Boston for over 15 years. Bathroom renovations, shower builds, floor tile, backsplash, and repair.',
    },
  ],
}
