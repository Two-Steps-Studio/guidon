# Guidon search visibility - 2026-10-30

Task: `586ebc98-2561-4715-a29b-adbd7913591d`.

Implemented a shorter brand-led title and description, a WebSite alternate name matching the canonical host, removal of login/signup from the sitemap, `noindex,follow` for authentication pages, and removal of fabricated request/build-time `lastmod` timestamps. Existing canonical URLs and WebSite structured data are retained. Legal pages remain excluded until their existing publication gate is satisfied.

Google describes site-name selection as automated; these changes do not guarantee a particular search rank. Its [site-name guidance](https://developers.google.com/search/docs/appearance/site-names) recommends consistent homepage branding and WebSite data. Its [sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) requires accurate, meaningful modification dates; omitting an unknown timestamp is preferable to inventing freshness.

After the approved deploy, use the verified Search Console property for `useguidon.com`: inspect the canonical homepage, submit `/sitemap.xml`, request a recrawl, then compare brand query impressions/clicks/position over subsequent weeks. Search Console ownership, actual index coverage and ranking changes are not verified in this batch. Do not claim the task's ranking outcome is complete from metadata changes alone.
