import type { CollectionConfig } from 'payload'

export const ContentQueue: CollectionConfig = {
  slug: 'content-queue',
  admin: {
    useAsTitle: 'keyword',
    defaultColumns: ['keyword', 'serviceType', 'articleType', 'priority', 'status'],
    group: 'Blog Engine',
  },
  access: {
    read: ({ req: { user } }) => !!user,
    create: ({ req: { user } }) => !!user,
    update: ({ req: { user } }) => !!user,
    delete: ({ req: { user } }) => !!user,
  },
  fields: [
    {
      name: 'keyword',
      type: 'text',
      required: true,
      admin: {
        description: 'Focus keyword — drives the URL slug, AI-generated title, and all content. This is the exact search query we want to rank for.',
      },
    },
    {
      name: 'serviceType',
      type: 'select',
      required: true,
      index: true,
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
        description: 'Which tile service this article relates to',
      },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'URL slug for the generated article',
      },
      hooks: {
        beforeValidate: [
          ({ value, data }) => {
            if (!value && data?.keyword) {
              return data.keyword
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
      name: 'articleType',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Hub', value: 'hub' },
        { label: 'Pillar', value: 'pillar' },
        { label: 'Spoke', value: 'spoke' },
      ],
      admin: {
        description: 'Hub = main topic page, Pillar = subtopic, Spoke = individual article',
      },
    },
    {
      name: 'articleStyle',
      type: 'select',
      defaultValue: 'standard',
      options: [
        { label: 'Standard', value: 'standard' },
        { label: 'Narrative', value: 'narrative' },
        { label: 'Listicle', value: 'listicle' },
        { label: 'Data-Heavy', value: 'data-heavy' },
        { label: 'Comparison', value: 'comparison' },
        { label: 'How-To', value: 'how-to' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Controls article opening structure and tone variation',
      },
    },
    {
      name: 'parentSlug',
      type: 'text',
      admin: {
        description: 'Parent article slug (for pillars and spokes)',
      },
    },
    {
      name: 'hubSlug',
      type: 'text',
      admin: {
        description: 'Hub article slug for the topic cluster',
      },
    },
    // SEO metrics
    {
      name: 'searchVolume',
      type: 'number',
      admin: {
        description: 'Monthly search volume estimate',
      },
    },
    {
      name: 'seoDifficulty',
      type: 'number',
      min: 0,
      max: 100,
      admin: {
        description: 'SEO difficulty score (0-100)',
      },
    },
    {
      name: 'targetWords',
      type: 'number',
      defaultValue: 1500,
      admin: {
        description: 'Target word count for the article',
      },
    },
    // Priority and status
    {
      name: 'priority',
      type: 'select',
      required: true,
      defaultValue: 'S2',
      options: [
        { label: 'S1 - High', value: 'S1' },
        { label: 'S2 - Medium', value: 'S2' },
        { label: 'S3 - Low', value: 'S3' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'queued',
      index: true,
      options: [
        { label: 'Queued', value: 'queued' },
        { label: 'Generating', value: 'generating' },
        { label: 'Draft', value: 'draft' },
        { label: 'Review', value: 'review' },
        { label: 'Published', value: 'published' },
        { label: 'Error', value: 'error' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    // Batching
    {
      name: 'batch',
      type: 'text',
      admin: {
        position: 'sidebar',
        description: 'Batch group name (e.g., "week-1", "bathroom-launch")',
      },
    },
    {
      name: 'scheduledPublishDate',
      type: 'date',
      admin: {
        position: 'sidebar',
        description: 'Scheduled publish date for batch publishing',
      },
    },
    // Competitor research
    {
      name: 'competitorUrls',
      type: 'array',
      admin: {
        description: 'URLs of competitor articles to analyze',
      },
      fields: [
        {
          name: 'url',
          type: 'text',
          required: true,
        },
      ],
    },
    // Article outline
    {
      name: 'outline',
      type: 'array',
      admin: {
        description: 'Article outline (headings and structure)',
      },
      fields: [
        {
          name: 'order',
          type: 'number',
          required: true,
        },
        {
          name: 'anchorId',
          type: 'text',
          admin: {
            description: 'HTML anchor ID for this section',
          },
        },
        {
          name: 'heading',
          type: 'text',
          required: true,
        },
        {
          name: 'summary',
          type: 'textarea',
          admin: {
            description: 'Brief description of section content',
          },
        },
        {
          name: 'linksTo',
          type: 'text',
          admin: {
            description: 'Slug of article this section should link to',
          },
        },
      ],
    },
    // Generated content link
    {
      name: 'generatedPost',
      type: 'relationship',
      relationTo: 'blog-posts',
      admin: {
        position: 'sidebar',
        description: 'The generated blog post (set automatically)',
      },
    },
    // Error tracking
    {
      name: 'errorMessage',
      type: 'textarea',
      admin: {
        position: 'sidebar',
        description: 'Error details if generation failed',
        condition: (data) => data?.status === 'error',
      },
    },
    // Notes
    {
      name: 'notes',
      type: 'textarea',
      admin: {
        description: 'Internal notes about this queue item',
      },
    },
  ],
}
