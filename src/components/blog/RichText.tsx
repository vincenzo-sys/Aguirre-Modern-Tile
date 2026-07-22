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
  if (format & 16) node = <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">{node}</code>
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
    const rawUrl = fields.url || node.url || '#'
    // Block script-y schemes robustly. A bare startsWith('javascript:') is
    // bypassable — browsers ignore case and strip ASCII whitespace (space, tab,
    // newline, CR, form-feed) from URLs, so "JavaScript:", " javascript:" and
    // "java\tscript:" all execute. Strip that whitespace + lowercase before
    // testing the scheme; the rendered href still uses the original rawUrl.
    const schemeProbe = String(rawUrl).replace(/[\t\n\r\f\v ]/g, '').toLowerCase()
    const url = /^(javascript|data|vbscript):/.test(schemeProbe) ? '#' : rawUrl
    const newTab = fields.newTab || node.newTab
    return (
      <a
        key={index}
        href={url}
        className="text-primary-600 underline hover:text-primary-800 transition-colors"
        {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {children}
      </a>
    )
  }

  // Heading
  if (node.type === 'heading') {
    const tag = node.tag || 'h2'
    const headingClasses: Record<string, string> = {
      h1: 'text-3xl font-bold mt-10 mb-4 text-gray-900',
      h2: 'text-2xl font-bold mt-10 mb-4 text-gray-900',
      h3: 'text-xl font-semibold mt-8 mb-3 text-gray-900',
      h4: 'text-lg font-semibold mt-6 mb-2 text-gray-900',
      h5: 'text-base font-semibold mt-4 mb-2 text-gray-900',
      h6: 'text-sm font-semibold mt-4 mb-2 text-gray-900',
    }
    return React.createElement(tag, { key: index, className: headingClasses[tag] || headingClasses.h2 }, ...children)
  }

  // Paragraph
  if (node.type === 'paragraph') {
    return <p key={index} className="mb-4 leading-relaxed text-gray-700">{children}</p>
  }

  // List
  if (node.type === 'list') {
    if (node.listType === 'number') {
      return <ol key={index} className="mb-4 pl-6 list-decimal text-gray-700">{children}</ol>
    }
    return <ul key={index} className="mb-4 pl-6 list-disc text-gray-700">{children}</ul>
  }

  // List item
  if (node.type === 'listitem') {
    return <li key={index} className="mb-2 leading-relaxed">{children}</li>
  }

  // Quote / blockquote
  if (node.type === 'quote') {
    return (
      <blockquote key={index} className="border-l-4 border-primary-500 bg-primary-50 pl-4 pr-4 py-3 my-6 italic text-gray-700 rounded-r-lg">
        {children}
      </blockquote>
    )
  }

  // Horizontal rule
  if (node.type === 'horizontalrule') {
    return <hr key={index} className="my-8 border-gray-200" />
  }

  // Table support
  if (node.type === 'table') {
    return <table key={index} className="w-full border-collapse my-6 text-sm">{children}</table>
  }
  if (node.type === 'tablerow') {
    return <tr key={index}>{children}</tr>
  }
  if (node.type === 'tablecell') {
    const isHeader = (node as Record<string, unknown>).headerState === 1
    const Tag = isHeader ? 'th' : 'td'
    const className = isHeader
      ? 'border border-gray-300 bg-gray-100 px-3 py-2 font-semibold text-left text-gray-900'
      : 'border border-gray-200 px-3 py-2 text-gray-700'
    return <Tag key={index} className={className}>{children}</Tag>
  }

  // Upload / image
  if (node.type === 'upload') {
    const value = node.value || {}
    const url = value.url || ''
    const alt = value.alt || ''
    if (url) {
      return (
        <figure key={index} className="my-8">
          <img src={url} alt={alt} className="max-w-full rounded-lg" />
          {alt && <figcaption className="mt-2 text-center text-sm text-gray-500 italic">{alt}</figcaption>}
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
