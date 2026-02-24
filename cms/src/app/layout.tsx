import React from 'react'

/* Payload's RootLayout (in the (payload) route group) renders its own
   <html> and <body> tags, so this root layout must NOT add another set
   or the nested tags will break React hydration (blank white page). */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
