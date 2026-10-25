import { legalOperator, type LegalCopy } from "@/lib/legal";

const contact = legalOperator.email;
export const termsCopy: LegalCopy = {
  title: "Terms of Service",
  introduction: "These terms govern Guidon Cloud at useguidon.com and our hosted project-management services. The service provider is the person identified below, using Guidon as the product name. A brand name is not a separate legal entity.",
  sections: [
    { heading: "Agreement and eligibility", paragraphs: [
      "Read these terms before creating an account or purchasing a plan. The registration and checkout screens identify the terms presented for acceptance. Reading a public page alone does not create a paid subscription. A person acting for an organisation must be authorised to bind it.",
      "You must have the legal capacity required for the transaction or valid representation or authorisation under applicable law. Keep your account information accurate and protect your credentials. Tell us promptly about suspected unauthorised access. You are responsible for uses you authorise and for permissions you control, not automatically for conduct outside your reasonable control."
    ] },
    { heading: "Scope, beta features and availability", paragraphs: [
      "Guidon supports tasks, files, decisions, knowledge, project context, APIs, MCP clients and optional integrations. Availability depends on the selected plan, configuration and version. Features marked beta or preview may change and may be less reliable; assess them before using them for important work. Beta labels do not remove mandatory rights or excuse a failure to supply a paid service as agreed.",
      "Unless a separately agreed service level applies, we do not promise uninterrupted operation or a particular business result. We may perform necessary maintenance or security work. Material changes to a paid service require a valid reason, appropriate notice and any remedies required by law. We do not retroactively remove agreed rights by editing a web page."
    ] },
    { heading: "Subscriptions, trials and cancellation", paragraphs: [
      "The checkout identifies the plan, included limits, price, currency, applicable taxes, billing interval, renewal and any trial before you order. Trial availability and duration are those actually offered at checkout. Payment processing is provided through Stripe or the relevant app marketplace, under the terms disclosed for that transaction.",
      "A recurring subscription renews for its disclosed interval until cancelled. Use the organisation billing controls or contact support if you cannot access them. Cancellation ordinarily stops future renewals at the end of the paid period; it does not itself delete the account. Any immediate termination, refund or continued-access right required by law takes priority. A trial is separate from a statutory withdrawal period.",
      "For business customers, charges already earned are normally not refundable unless agreed otherwise. This does not restrict consumer refunds, conformity remedies, withdrawal rights or refunds for services we fail to provide. Price increases apply prospectively with advance notice and an opportunity to cancel before the new price applies."
    ] },
    { heading: "Consumers, withdrawal and complaints", paragraphs: [
      "If you are a consumer or benefit from equivalent mandatory protection, your statutory rights remain intact. Distance contracts may carry a 14-day withdrawal right and rights concerning the conformity of digital services. Exceptions apply only where their legal conditions, required information and express requests or acknowledgements have actually been satisfied. Creating an account or starting a trial is not a blanket waiver.",
      `To withdraw or complain, email ${contact} with your name, account email, the service or order concerned and a clear statement of your request. No special wording is required. You may use: “I withdraw from my contract for [service], concluded on [date]. Name: […]. Contact: […]. Date: […].” We handle requests within the deadlines required by applicable law. Do not send passwords or full payment-card details.`,
      "Where a consumer validly requests early performance and the law permits a proportionate charge following withdrawal, only the lawfully due amount is payable. Nothing here excludes remedies for non-conforming digital services, access to competent courts or applicable out-of-court consumer dispute procedures."
    ] },
    { heading: "Customer content and confidentiality", paragraphs: [
      "You or your licensors retain rights in your project data and files. You authorise us to host, copy, transmit and process that material only as needed to provide, secure and support the service, follow your instructions and comply with law. Uploading content does not give us a general licence to sell it, publish it or train a general-purpose AI model on it.",
      "Use appropriate permissions and upload only material you are entitled to process. We restrict access to non-public customer content to authorised personnel and service providers with a legitimate operational need and appropriate confidentiality obligations. An organisation controls its workspace; its administrators may manage access, export or delete workspace material within their permissions."
    ] },
    { heading: "AI, agents and external integrations", paragraphs: [
      "AI features and connected agents can send selected project context to the configured provider and can propose or perform actions within granted permissions. Review the provider, scopes and project settings before enabling them. Avoid sending sensitive information without a lawful basis and suitable safeguards. Disconnecting a client does not automatically delete copies already received by another provider.",
      "AI results may be inaccurate, incomplete or infringe another person's rights. Review outputs and consequential actions; an AI response is not legal, medical, financial or other regulated professional advice. You remain responsible for decisions you make, while we remain responsible for obligations the law places on us. No third-party provider's data-use or retention practice is guaranteed by these terms."
    ] },
    { heading: "Acceptable use and service rights", items: [
      "Do not access another organisation's data without permission, circumvent access controls, steal credentials or impersonate another user.",
      "Do not distribute unlawful content or malware, infringe rights, harass people, or interfere with the service through abusive automation or denial-of-service activity.",
      "Use API keys, integrations and agents only within their authorisation and documented limits. You may revoke access through the available controls.",
      "Our hosted-service and brand rights are reserved. Separate licences accompanying software, SDKs or other components control the rights they grant; these terms do not override them or prohibit activities protected by mandatory law. Access to a repository alone does not establish its licence."
    ] },
    { heading: "Data protection and self-hosting", paragraphs: [
      "The Privacy Policy and Cookie Notice explain our own processing and browser storage. Where we process personal data on an organisation's behalf, the parties must establish an appropriate data-processing agreement; contact us to arrange it. A privacy notice alone is not an executed Article 28 agreement.",
      "An independently operated self-hosted instance has its own operator, terms, security and privacy responsibilities. These Cloud terms do not make us the operator of that instance. Its deployment may contact external services selected by its operator, and visits to our website or contact with support remain subject to our own notices."
    ] },
    { heading: "Suspension, deletion and export", paragraphs: [
      "You may stop using the service and use available account or organisation deletion and export controls. Deleting an account is different from deleting shared organisational content. A sole owner may need to transfer ownership before leaving an organisation with other members. Export material you need before deleting it.",
      "We may restrict access for a material breach, non-payment, a security threat or a legal requirement. Where reasonably possible we explain the reason and allow a proportionate opportunity to resolve it. Urgent security or legal action may require immediate restriction. We consider lawful export requests and mandatory refund or consumer rights; suspension is not a licence to confiscate your content."
    ] },
    { heading: "Warranties and business liability", paragraphs: [
      "We supply the service subject to applicable mandatory duties and any express commitments in your order. To the extent permitted by law, we exclude other implied business warranties. Customers should maintain appropriate copies of important material; this does not excuse a breach of our own data-protection or agreed backup obligations.",
      "For customers acting in business, and only where lawful, our aggregate contractual liability arising from the service is limited to the greater of EUR 100 and the fees paid or payable for the affected service during the preceding 12 months. For those business customers we exclude indirect losses and loss of anticipated profits to the extent lawful.",
      "Those business limitations do not apply to consumers or persons entitled to equivalent mandatory protection, intentional misconduct, gross negligence, death or personal injury caused by our fault, statutory data-protection compensation, or any liability that cannot lawfully be excluded or limited. They do not transfer our statutory obligations to the customer."
    ] },
    { heading: "Changes, disputes and contact", paragraphs: [
      "We identify revisions by date and give appropriate advance notice of material changes affecting an ongoing contract, with any legally required cancellation or other rights. New terms do not automatically rewrite earlier transactions. A separately signed agreement takes precedence for matters it expressly addresses.",
      `Contact ${contact} first if a problem arises; this is not a condition that delays a statutory remedy or limitation deadline. Polish law applies, without depriving consumers of mandatory protections or jurisdiction rights available in their country of residence. Disputes go to courts competent under applicable law. These terms impose no mandatory US arbitration, jury waiver or class-action waiver.`
    ] },
  ],
};

export const privacyCopy: LegalCopy = {
  title: "Privacy Policy",
  introduction: "This notice concerns Guidon Cloud, our public website and communications with us. It describes processing rather than requesting blanket consent. A self-hosted instance run by another person has a different operator and privacy notice.",
  sections: [
    { heading: "Our role and workspace data", paragraphs: [
      "The identified service provider is responsible as controller for account administration, billing contacts, security, support and its own website operations. For project content processed solely on a customer organisation's instructions, that organisation ordinarily determines the purposes and acts as controller, while Guidon acts as processor. The actual relationship depends on the processing, not just these labels.",
      `Ask your organisation about its workspace instructions and access decisions. Contact ${contact} for our own processing or for help forwarding a workspace request to the responsible organisation. We may verify identity proportionately; do not send identity documents unless specifically requested through an appropriate channel.`
    ] },
    { heading: "Information and purposes", items: [
      "Account and membership information: email, name, avatar, authentication identifiers, roles and invitations, used to provide accounts and collaborative access. Login providers share fields authorised in their sign-in flow.",
      "Project material: tasks, comments, decisions, documents, uploaded files, code or repository references, AI prompts/results, project memory, activity and module records that you or your organisation choose to supply.",
      "Billing information: plan, subscription, payment status and transaction or billing identifiers. Stripe or an app marketplace processes payment details; we do not collect full card numbers through Guidon's own forms.",
      "Technical and security information: IP addresses, request/device information, timestamps, access logs and errors needed to operate, secure and diagnose the service. If Sentry is configured it receives diagnostic events; do not assume every error or URL is automatically anonymous.",
      "Support and feedback: information you send us, including messages, attachments and optional ratings, used to respond and improve the service. Avoid including secrets or unrelated personal information."
    ] },
    { heading: "Legal grounds and necessary information", paragraphs: [
      "For processing we control, we rely on performance of a contract or requested pre-contract steps for account/service administration; legal obligations for required records; and legitimate interests in proportionate security, fraud prevention, support and service reliability, balanced against people's rights. Consent is used where legally required for optional processing. You may withdraw it without affecting earlier lawful processing.",
      "An integration switch authorises a technical connection; it is not automatically the legal basis for every person's data included in that connection. Customer organisations must establish the basis for their own workspace processing. Account and transaction fields needed to fulfil a request are necessary for that request; optional project content is chosen by the customer."
    ] },
    { heading: "Recipients and integrations", paragraphs: [
      "Depending on configuration, Cloud uses Vercel for hosting/delivery, Supabase for database/authentication/storage, Resend for transactional messages, Stripe for payments, and Sentry for diagnostics if enabled. Providers receive information needed for their functions. A provider can have its own controller responsibilities, particularly for payments, security or legal compliance; not every recipient is simply our processor.",
      "Optional connections include GitHub, Discord, Slack, editor plugins, MCP/API clients, webhook recipients and the AI provider or compatible endpoint chosen for the workspace. They can receive content and identifiers needed for authorised actions. Providers' contracts, settings and retention rules matter. We do not promise that a remote endpoint described as self-hosted can never receive or onward-transfer data.",
      "We may disclose information when lawfully required, to protect rights and security, or during a properly safeguarded business transfer with required notices. We do not sell customer project content or use it to train a general-purpose AI model as a purpose of providing Guidon."
    ] },
    { heading: "International processing", paragraphs: [
      "Provider locations and authorised endpoints may involve countries outside the EEA. Before making a restricted transfer, the responsible party must establish the applicable lawful mechanism, such as an adequacy decision or appropriate contractual safeguards and any necessary supplementary measures. A provider's marketing claim alone is not our transfer assessment.",
      `Contact ${contact} for information about applicable recipients, locations and safeguards, or a copy where available, subject to appropriate confidentiality redactions. Specific regions and transfer arrangements must be confirmed for the deployed service; this notice does not assert EU-only residency or certification.`
    ] },
    { heading: "Retention and deletion", paragraphs: [
      "Account information is used while the account and associated service relationship remain active. Workspace content follows the organisation's instructions and available deletion controls. Deleting an individual account may leave shared work controlled by an organisation; sole-owner transfer requirements can prevent destructive account deletion until ownership is resolved.",
      "We retain required transaction records for the applicable legal retention period and limited information reasonably needed for security investigations, disputes or legal claims. Retention is determined by those purposes, applicable limitation periods and legal obligations, rather than a promise that every record disappears on the same day. Backups, vendor-held records and independent integration copies have separate lifecycles and access restrictions.",
      `Ask ${contact} for the applicable deletion/backup schedule and assistance with an erasure or export request. There is no blanket promise here that all data, backups and external-provider copies are removed within 30 days. Return/deletion obligations for processor-held data belong in the agreed DPA.`
    ] },
    { heading: "Rights and complaints", paragraphs: [
      "Subject to the conditions of applicable law, you may request access, correction, erasure, restriction or portability of personal data; object to legitimate-interest processing; and withdraw consent. We respond within the applicable legal deadline, ordinarily one month for GDPR requests, with any lawful extension explained. A workspace administrator or another controller may need to handle parts of your request.",
      `Send requests to ${contact}. You can complain to the Polish supervisory authority, President of the Personal Data Protection Office (UODO), or another competent supervisory authority. Contacting us first is optional and does not restrict that right. We do not use a solely automated decision with legal or similarly significant effects as the stated purpose of Guidon's AI assistance.`
    ] },
    { heading: "Browser storage, security and young users", paragraphs: [
      "The Cookie Notice lists authentication/session storage and user-requested preferences. This version does not load Google Analytics: the unconditional integration has been removed. Any future optional analytics requires an appropriate choice before activation and an updated notice. Error monitoring, server logs and essential storage are distinct from Google Analytics.",
      "We use access controls and operational safeguards appropriate to the service. No service is absolutely secure. Notifications of personal-data breaches follow the applicable controller/processor duties; a privacy notice does not replace those duties. Do not submit high-risk data without confirming the necessary agreements and safeguards.",
      "Guidon is not directed at children. Legal capacity to contract and parental authorisation are separate from the rules on consent to personal-data processing. If you believe information about a child has been supplied without required authority, contact us so we can assess and take appropriate action."
    ] },
    { heading: "Updates", paragraphs: [
      "We date revisions and provide appropriate notice of material changes. A new notice does not retroactively supply consent or another legal basis for earlier processing. Changes to the actual service, recipients or retention arrangements must be reflected here."
    ] },
  ],
};

export const cookiesCopy: LegalCopy = {
  title: "Cookie and Browser Storage Notice",
  introduction: "Guidon uses cookies and browser storage for authentication, security and preferences you request. This notice covers our Cloud website; another operator's self-hosted instance may have a different configuration.",
  sections: [
    { heading: "Authentication and security", paragraphs: [
      "Cloud authentication can use Supabase session/refresh cookies whose names and duration depend on its configuration. Independently deployed direct-PostgreSQL installations use the signed guidon-session cookie with an expiry set by their operator. OAuth flows can use short-lived state and PKCE-related cookies. These support login, verification and security; blocking them may prevent the requested service from working."
    ] },
    { heading: "Requested preferences", paragraphs: [
      "The theme cookie remembers appearance. sidebar_state remembers expanded/collapsed navigation for up to seven days. guidon-mini-filter and guidon-mini-project remember choices in the mini task view. Browser localStorage can remember background style/motion, sound and other device preferences selected in the interface. Local storage has no automatic browser expiry unless cleared or removed by the application.",
      "These choices are distinct from permission to track you for advertising or analytics. Use only storage necessary for the requested feature; adding another purpose requires a separate assessment and, where necessary, consent."
    ] },
    { heading: "Optional analytics and existing cookies", paragraphs: [
      "This version does not include the Google Analytics script or create Google Analytics cookies. Earlier versions could have loaded Google Analytics and left cookies such as _ga or _ga_* in your browser. Removing the script does not by itself erase those old cookies or information already received by Google.",
      "You can remove stored site data through your browser's privacy settings and consult Google's privacy controls for information it already holds. Optional analytics must not be re-enabled without a suitable informed opt-in and a way to withdraw it. We do not treat visiting the site, dismissing a notice or accepting the service terms as analytics consent."
    ] },
    { heading: "Controls and external providers", paragraphs: [
      "You can clear or restrict cookies and storage through your browser, reset choices in the application, and disconnect available integrations. Clearing storage may sign you out or reset preferences. Authentication providers or external sites opened at your request have their own storage practices. Sentry diagnostics and server access logs, where configured, are described in the Privacy Policy rather than hidden under a claim that the service performs no monitoring.",
      `For a question or privacy request, contact ${contact}.`
    ] },
  ],
};
