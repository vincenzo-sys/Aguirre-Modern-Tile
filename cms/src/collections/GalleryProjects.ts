import type { CollectionConfig } from 'payload'

export const GalleryProjects: CollectionConfig = {
  slug: 'gallery-projects',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', 'image'],
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
      name: 'image',
      type: 'text',
      required: true,
      admin: {
        description: 'Image path, e.g. "/images/gallery/bathroom-1.jpg"',
      },
    },
    {
      name: 'category',
      type: 'select',
      required: true,
      options: [
        { label: 'Bathroom', value: 'Bathroom' },
        { label: 'Shower', value: 'Shower' },
        { label: 'Floor', value: 'Floor' },
        { label: 'Backsplash', value: 'Backsplash' },
        { label: 'Repair', value: 'Repair' },
        { label: 'Reglazing', value: 'Reglazing' },
        { label: 'Other', value: 'Other' },
      ],
    },
    {
      name: 'sortOrder',
      type: 'number',
      defaultValue: 0,
    },
  ],
}
