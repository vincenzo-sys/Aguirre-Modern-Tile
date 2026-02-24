'use client'

import React from 'react'

interface LexicalNode {
  type: string
  tag?: string
  children?: LexicalNode[]
  text?: string
  format?: number | string
  url?: string
  newTab?: boolean
  value?: { url?: string; alt?: string }
  listType?: string
  version?: number
  direction?: string
  indent?: number
  [key: string]: any
}

interface RichTextProps {
  data: {
    root: {
      children: LexicalNode[]
      [key: string]: any
    }
  } | null
}

function renderTextFormats(text: string, format: number): React.ReactNode {
  let node: React.ReactNode = text
  if (format & 1) node = <strong>{node}</strong>
  if (format & 2) node = <em>{node}</em>
  if (format & 4) node = <s>{node}</s>
  if (format & 8) node = <u>{node}</u>
  if (format & 16) node = <code>{node}</code>
  if (format & 32) node = <sub>{node}</sub>
  if (format & 64) node = <sup>{node}</sup>
  return node
}

function renderNode(node: LexicalNode, index: number): React.ReactNode {
  // Text node
  if (node.type === 'text') {
    const format = typeof node.format === 'number' ? node.format : 0
    if (format === 0) return node.text || ''
    return <React.Fragment key={index}>{renderTextFormats(node.text || '', format)}</React.Fragment>
  }

  // Linebreak
  if (node.type === 'linebreak') {
    return <br key={index} />
  }

  const children = node.children?.map((child, i) => renderNode(child, i)) || []

  // Link
  if (node.type === 'link') {
    const fields = node.fields || {}
    const url = fields.url || node.url || '#'
    const newTab = fields.newTab || node.newTab
    return (
      <a
        key={index}
        href={url}
        {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {children}
      </a>
    )
  }

  // Heading
  if (node.type === 'heading') {
    const tag = node.tag || 'h2'
    return React.createElement(tag, { key: index }, ...children)
  }

  // Paragraph
  if (node.type === 'paragraph') {
    return <p key={index}>{children}</p>
  }

  // List
  if (node.type === 'list') {
    const Tag = node.listType === 'number' ? 'ol' : 'ul'
    return <Tag key={index}>{children}</Tag>
  }

  // List item
  if (node.type === 'listitem') {
    return <li key={index}>{children}</li>
  }

  // Quote / blockquote
  if (node.type === 'quote') {
    return <blockquote key={index}>{children}</blockquote>
  }

  // Horizontal rule
  if (node.type === 'horizontalrule') {
    return <hr key={index} />
  }

  // Upload / image
  if (node.type === 'upload') {
    const value = node.value || {}
    const url = value.url || ''
    const alt = value.alt || ''
    if (url) {
      return (
        <figure key={index}>
          <img src={url} alt={alt} style={{ maxWidth: '100%' }} />
          {alt && <figcaption>{alt}</figcaption>}
        </figure>
      )
    }
    return null
  }

  // Fallback: render children in a fragment
  if (children.length > 0) {
    return <React.Fragment key={index}>{children}</React.Fragment>
  }

  return null
}

export default function RichText({ data }: RichTextProps) {
  if (!data?.root?.children) return null

  return (
    <>
      {data.root.children.map((node, index) => renderNode(node, index))}
    </>
  )
}
