import { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site-url'
import { legalPublicationReady } from '@/lib/legal'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = SITE_URL

  // Only include public pages that should be indexed by search engines
  const routes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/auth/login`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/auth/signup`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/developers`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/sandbox`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/legal/terms`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${baseUrl}/legal/privacy`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${baseUrl}/legal/refunds`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${baseUrl}/legal/eula`,
      lastModified: new Date(),
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
    '/plugins',
    '/.well-known/agent-skills/index.json',
    '/.well-known/ard.json',
  ]) {
    routes.push({
      url: `${baseUrl}${path}`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    })
  }

  if (legalPublicationReady) routes.push({ url: `${baseUrl}/legal/cookies`, changeFrequency: 'yearly', priority: 0.2 })
  return routes.filter(route => legalPublicationReady || !new URL(route.url).pathname.startsWith('/legal/'))
}
