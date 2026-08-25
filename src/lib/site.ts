// The one canonical origin for everything Google reads.
//
// Vercel serves this site on www and 307-redirects the apex
// (https://aguirremoderntile.com/blog -> https://www.aguirremoderntile.com/blog).
// For a long time the metadata said the opposite: metadataBase, robots.txt and
// all 3,444 sitemap URLs declared the apex. That meant every URL we handed
// Google was a redirect, and every rel=canonical pointed at a host that
// redirects back — so Search Console reported the site as "Page with redirect"
// and "Duplicate, Google chose a different canonical" instead of reporting
// rankings. Declaring the host we actually serve is what makes the Search
// Console data trustworthy.
//
// If the primary domain in Vercel ever changes, change it here — every
// canonical, OG url, sitemap entry and JSON-LD url is derived from this.
export const SITE_URL = 'https://www.aguirremoderntile.com'
