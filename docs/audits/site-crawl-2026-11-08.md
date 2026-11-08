# Public site crawl follow-up

The supplied Screaming Frog overview contains 21 issue types and counts, but
no affected URLs. The follow-up sampled the public sitemap, login and onboarding,
legal pages, and links and image assets found on those pages. It did not crawl
private projects or use an authenticated production session.

| Export row | Finding and action |
| --- | --- |
| Duplicate X Card description | Legal, login and onboarding pages inherited the landing description. Added descriptions for their purpose. |
| Noindex | Confirmed on login and five unpublished legal pages. The public HTML pages from the sitemap were indexable. Private and transactional pages should stay out of search. |
| External 5xx | Several GitHub requests timed out from the crawl runner. The referenced Guidon paths exist in Git; the five original failing URLs were not identified by the export. |
| Bad Content Type | The tested HTML, PNG, SVG, JSON and Markdown responses had matching media types. The two original URLs were not identified. |
| Missing Image Title | A title is optional and would duplicate the existing alternative text on the tested images. |
| Uppercase URLs | The sample includes case-sensitive upstream links and asset identifiers. No duplicate public page caused by casing was found in the sitemap. |
| Page title below 30 characters | Clarified the onboarding, sign-in and shorter legal titles. Page titles describe the destination rather than target a fixed length. |
| Low content | The public setup flow starts with a short step and a clear choice. Extra text would not help complete that step. The original URL was not specified. |
| Duplicate OG description | Same inherited descriptions as the X Card finding. Each affected page now supplies its own. |
| Images over 100 kB | The social card PNG dropped from 234,494 to 94,251 bytes at 1200 × 630. The brand page now serves an 85,331-byte, 400 × 400 avatar PNG. The original high-resolution avatar is still available in the brand kit. |
| High external outlinks | The developer guide links to repository documentation, downloads and installation instructions. Retained those references. |
| Incomplete X Cards | Retained large image cards and verified title, description and image. Account handles are optional and must match a verified account. |
| Missing H2 | Login and setup are single-step views with an H1. They do not need an empty section heading. The original URL was not specified. |
| Blocked by robots.txt | The rules exclude private application and API routes and explicitly permit public MCP server cards. No tested indexable HTML route was blocked. The original URL was not specified. |
| Incomplete OG tags | Public HTML pages now set their own `og:url` and a preview image, including the localized brand and onboarding pages. |
| Page title below 200 pixels | The shortest setup and legal titles now provide more context. Exact pixel width depends on the language and font. |
| Duplicate meta description | Added page-specific descriptions, also used by social previews. |
| URL parameters | Next.js image variants and sign-in return paths use parameters for their intended behavior. Public pages point to their clean canonical URLs. |
| Internal redirection | The sample confirmed intended redirects from protected pages to sign-in and from HTTP and www to the HTTPS apex. The two original URLs were not specified. |
| Alt text over 100 characters | Shortened the dashboard screenshot alternative text in all supported locales while retaining its meaning. |
| Multiple H2s | Public documents and the homepage use multiple H2s for separate sections. That is valid heading structure. |

To compare any remaining crawler alert precisely, export the affected URL
and its inlinks for that issue. For an external 5xx include the HTTP status,
and for a media-type warning include both the served type and the expected
type.
