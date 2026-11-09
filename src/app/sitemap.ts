import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site-url'
import { legalPublicationReady } from '@/lib/legal'
import { CHECKED, COMPARISONS } from '@/lib/compare'

// Dates of meaningful edits to the published content. Update the affected
// routes (including document twins) when their content changes. Never use
// the build or request date, and omit the date when it is not known.
const contentDates: Partial<Record<string, string>> = {
  '/': '2026-11-08',
  '/about': '2026-11-08',
  '/contact': '2026-11-08',
  '/sandbox': '2026-11-08',
  '/developers': '2026-11-08',
  '/developers.md': '2026-10-28',
  '/developers/llms.txt': '2026-10-28',
  '/openapi.json': '2026-11-08',
  '/auth.md': '2026-10-25',
  '/auth/llms.txt': '2026-10-25',
  '/pricing.md': '2026-11-06',
  '/llms.txt': '2026-10-28',
  '/brand': '2026-11-08',
}

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = SITE_URL

  // Only include public pages that should be indexed by search engines
  const routes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/developers`,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/about`,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/sandbox`,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/contact`,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/legal/terms`,
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${baseUrl}/legal/privacy`,
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${baseUrl}/legal/refunds`,
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${baseUrl}/legal/eula`,
      changeFrequency: 'yearly',
      priority: 0.2,
    },
  ]

  // These are public, canonical developer resources. Listing them explicitly
  // helps crawlers find the API and agent setup without relying on llms.txt
  // support; the site-wide agent guide also links to the machine-readable files.
  for (const path of [
    '/openapi.json',
    '/auth.md',
    '/auth/llms.txt',
    '/developers.md',
    '/developers/llms.txt',
    '/pricing.md',
    '/llms.txt',
    '/brand',
    '/.well-known/agent-skills/index.json',
    '/.well-known/ard.json',
  ]) {
    routes.push({
      url: `${baseUrl}${path}`,
      changeFrequency: 'monthly',
      priority: 0.6,
    })
  }

  // Comparisons (src/lib/compare.ts): the index, then one page per tool.
  for (const path of ['/compare', ...COMPARISONS.map((c) => `/compare/${c.slug}`)]) {
    routes.push({ url: `${baseUrl}${path}`, lastModified: CHECKED, changeFrequency: 'monthly', priority: 0.5 })
  }

  if (legalPublicationReady) routes.push({ url: `${baseUrl}/legal/cookies`, changeFrequency: 'yearly', priority: 0.2 })
  return routes.flatMap(route => {
    const { pathname } = new URL(route.url)
    if (!legalPublicationReady && pathname.startsWith('/legal/')) return []
    const lastModified = contentDates[pathname]
    return [lastModified ? { ...route, lastModified } : route]
  })
}
