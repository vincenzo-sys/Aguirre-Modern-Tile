'use client'

import { useState } from 'react'
import { Calendar, Copy, Check, X, ExternalLink } from 'lucide-react'

export default function IcsSubscribeButton({ icsUrl }: { icsUrl: string }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(icsUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked (e.g. insecure context) — user can still select manually
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
      >
        <Calendar className="w-4 h-4" />
        Subscribe in Calendar
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">Subscribe to your schedule</h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-gray-100 text-gray-500"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Add this calendar to Google Calendar or Apple Calendar so estimate visits and installs show up on your phone.
            </p>

            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Calendar URL
            </label>
            <div className="flex gap-2 mb-4">
              <input
                readOnly
                value={icsUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 px-3 py-2 text-sm font-mono border border-gray-200 rounded bg-gray-50 text-gray-800"
              />
              <button
                onClick={copy}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded text-sm font-medium bg-primary-600 text-white hover:bg-primary-700"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700">
              <p className="font-semibold mb-2 text-gray-900">How to add it</p>
              <ul className="space-y-2">
                <li>
                  <strong>Google Calendar (web):</strong> Settings → Add calendar → From URL → paste.{' '}
                  <a
                    href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-primary-700 hover:underline"
                  >
                    Open <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
                <li>
                  <strong>Apple Calendar (Mac):</strong> File → New Calendar Subscription → paste URL.
                </li>
                <li>
                  <strong>iPhone:</strong> Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar → paste URL.
                </li>
              </ul>
              <p className="mt-3 text-xs text-gray-500">
                Calendar updates every 5–60 minutes depending on the client. The URL contains a secret — don&apos;t share it.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
