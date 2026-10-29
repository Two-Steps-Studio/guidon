# Guidon legal adaptation - review draft

Prepared 2026-10-25. These documents reduce ambiguity; they do not guarantee compliance or prevent claims. Do not deploy this draft as adopted contractual terms until the checks below are resolved.

## Source and licence

Adapted with reference to [General Legal templates](https://github.com/General-Legal/legal-templates/tree/6d6805425eabd41bed86fc1e2ec51612760f716c), pinned to commit `6d6805425eabd41bed86fc1e2ec51612760f716c`: terms-of-use, privacy-policy-gdpr, cookie-notice and dpa-global. The upstream CC0 1.0 licence is retained in [sources/General-Legal-CC0-1.0.txt](sources/General-Legal-CC0-1.0.txt). Guidon adaptations have not been reviewed or endorsed by General Legal. This does not change the software's licence.

The upstream GDPR privacy template assumes a US organisation. This adaptation instead describes a Polish operator and preserves mandatory consumer rights. US arbitration, jury/class waivers, noncommercial-only use, blanket indemnities and automatic consumer liability exclusions were not carried over. App Store EULA minimum provisions remain in the existing EULA, including Family Sharing and volume purchasing.

## Implementation

- Terms, privacy and cookie text: `src/lib/legal-copy.ts`; version and public operator fields: `src/lib/legal.ts`.
- Shared legal layout explicitly marks unapproved documents as drafts. Draft pages use noindex and are omitted from the sitemap. This is not access control: they remain publicly reachable if deployed.
- `LEGAL_OPERATOR_NAME`, `LEGAL_OPERATOR_ADDRESS`, `LEGAL_OPERATOR_PHONE`, `LEGAL_OPERATOR_EMAIL` contain public business contact information. Never add identity documents or confidential details. `LEGAL_DOCUMENTS_APPROVED=true` only removes the draft marking when the required public fields are filled; it is not a legal certification. Rebuild/redeploy after configuration changes.
- Cloud registration shows terms/privacy information before password or provider sign-in, in EN/PL/DE/ES. This is not consent for analytics, proof of historical acceptance or a signed DPA. Existing accounts have not accepted a new version automatically.
- Unconditional Google Analytics loading was removed from the root layout. Existing Google-held data and browser cookies are not thereby erased. Reintroduction requires an informed consent flow before loading optional tracking, withdrawal controls and updated notices.
- The DPA below is an internal negotiation draft, not an executed public agreement. Do not onboard processor-controlled customer data under an assumption that merely publishing a privacy notice concludes it.

## Adoption checklist

1. Identify the actual contracting provider/controller by legal name, country and lawful public contact details, and verify authority/capacity and any necessary representation. A brand is not a legal person. Obtain Polish legal review; do not invent an entity or registration number.
2. Approve the business terms, including the proposed business-only liability ceiling (higher of EUR 100 or preceding 12 months' fees), consumer exceptions, notices, withdrawal procedure and complaint handling. Verify checkout disclosures and any early-performance requests against the actual payment flows.
3. Confirm each recipient's legal entity, service role, region, contract, subprocessor arrangements and lawful transfer mechanism. No EU-only residency, adequacy certification or signed SCCs are asserted by this draft. Complete the DPA annexes before execution.
4. Define and verify retention, backup expiry, deletion/return and incident-response procedures with actual infrastructure settings. Security/diagnostic telemetry requires its own necessity and data-minimisation assessment; disabling GA does not make Sentry or logs anonymous.
5. Review the English legal text and required Polish/local consumer information and translations. Check App Store developer name, address, telephone and email against Apple's minimum EULA terms and store listing. Do not publish incomplete provider identification.
6. Set an actual adoption/effective date and notify existing users of material changes with required rights. Record the presented version for future acceptance where necessary; this patch does not fabricate historical records. Keep earlier versions (the previous text is in Git at `730f02a`).
7. Review the deployed pages, signup links, billing, cancellation, deletion and privacy request handling; only then approve publication and separately authorise deployment. This branch does not deploy production.

## Evidence behind the content

Account deletion follows `src/lib/account/account-deletion-core.ts`: shared organisation content and sole-owner transfers require separate treatment. Storage disclosures reflect authentication cookies and preference code rather than a claim that all cookies expire on session close. Self-hosted operators and configured integrations have separate responsibilities. Source access does not imply an open-source licence.

## Primary review references

- [GDPR, including Articles 13 and 28](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679)
- [Polish Civil Code consolidated publication](https://www.dziennikustaw.gov.pl/DU/2026/795)
- [Polish Consumer Rights Act](https://eli.gov.pl/api/acts/DU/2024/1796/text.html)
- [Apple minimum custom EULA terms](https://www.apple.com/legal/internet-services/itunes/dev/minterms/)

The code and vendor configuration must continue to match the notices after adoption. Templates are a starting point for review, not evidence that all operational duties have been fulfilled.
