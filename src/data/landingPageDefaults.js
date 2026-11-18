export const defaultLandingPageConfig = {
  key: 'main_landing_page',
  header: {
    brandName: 'Deotech',
    brandHighlight: 'CMS',
    brandBadge: 'Enterprise Headless Suite',
    signInText: 'Sign In',
    freeTrialText: 'Start Free Trial',
    dashboardText: 'Dashboard',
  },
  announcement: {
    enabled: true,
    badge: 'New in Phase 2B',
    text: 'Zero Data Loss Transactional Outbox & Sleep-Proof Scheduled Publishing are live!',
    linkText: 'See how it works →',
    linkUrl: '#architecture',
  },
  hero: {
    pillBadge: 'Next-Gen Headless & Reverse-Proxy Engine',
    pillSubtext: 'Phase 2B Reliability Verified',
    title: 'The High-Performance CMS Built for Zero Data Loss & Universal Web Publishing',
    highlightWords: 'Zero Data Loss',
    subtitle:
      'Empower your marketing and engineering teams to embed lightning-fast blogs into any website—WordPress, Next.js, Shopify, or Laravel. Eliminate webhook drops with transactional outbox staging and publish scheduled blogs flawlessly, even when free cloud containers sleep.',
    primaryCtaText: 'Start 14-Day Free Trial',
    primaryCtaLink: '/register',
    secondaryCtaText: 'View Pricing & Rates',
    secondaryCtaLink: '#pricing',
    docsCtaText: 'Swagger Docs',
    docsCtaLink: '/api-docs',
    heroImageUrl: '',
  },
  trustBadges: [
    { title: 'Transactional Outbox', subtitle: '100% Guaranteed Webhooks', iconType: 'shield' },
    { title: 'Sleep-Proof Daemon', subtitle: 'Atomic Scheduled Cron', iconType: 'clock' },
    { title: 'Universal Embed', subtitle: 'Next.js, WP, Shopify, PHP', iconType: 'code' },
    { title: 'Sub-50ms TTFB', subtitle: 'Automated SEO Schema', iconType: 'zap' },
  ],
  sectionsMeta: {
    whyUsBadge: 'The Mission Behind Deotech CMS',
    whyUsHeading: 'Why We Built Deotech CMS',
    whyUsSubtitle:
      'For over a decade, teams were forced to compromise: endure slow, plugin-heavy WordPress monoliths or struggle with decoupled headless systems plagued by dropped webhooks and missed scheduled publishing.',
    featuresBadge: 'How Deotech CMS Helps Your Business',
    featuresHeading: 'Engineered for Speed, Reliability & Scale',
    featuresSubtitle:
      'Everything your editorial team and engineering department need to publish with complete confidence.',
    architectureBadge: 'Under The Hood',
    architectureHeading: 'Enterprise Reliability Architecture',
    architectureSubtitle:
      'Explore how Deotech CMS eliminates edge-case race conditions, guarantees delivery, and integrates anywhere.',
    comparisonBadge: 'Direct Comparison',
    comparisonHeading: 'Traditional CMS vs. Deotech Unified CMS',
    comparisonSubtitle:
      'See why leading agencies and digital publishers are moving away from bloated monoliths.',
    pricingBadge: 'Transparent, Value-Driven Plans',
    pricingHeading: 'Choose the Plan That Fits Your Scale',
    pricingSubtitle:
      'Start with a 14-day free trial on any tier. No surprise fees. Upgrade or cancel anytime.',
    faqBadge: 'Got Questions?',
    faqHeading: 'Frequently Asked Questions',
    faqSubtitle:
      'Everything you need to know about Deotech CMS, webhooks, sleeping containers, and pricing.',
  },
  whyUs: [
    {
      id: 'dual-write',
      title: 'The Dual-Write Outbox Trap',
      description:
        'Traditional headless CMS platforms update their database first, then fire a webhook over HTTP. If the destination server hiccups or returns 500, the update is dropped forever. Your website becomes stale and out of sync without anyone knowing.',
      solution: 'Deotech Fix: Atomic MongoDB outbox staging + retry daemon.',
    },
    {
      id: 'sleeping-workers',
      title: 'Sleeping Cloud Workers',
      description:
        'Modern platforms (like Render Free, Cloud Run, or Heroku) spin down containers when inactive. When a scheduled blog post comes due at 9:00 AM, the server is asleep. The post sits unpublished until hours later when an admin manually wakes it up.',
      solution: 'Deotech Fix: Timing-safe external cron trigger wakes instances safely.',
    },
    {
      id: 'wp-fragility',
      title: 'WordPress Plugin Fragility',
      description:
        'WordPress sites crumble under the weight of 40+ plugins just to handle SEO, caching, webhooks, and multi-authors. Security patches break layouts, page load times balloon past 3.5s, and Google penalizes your Core Web Vitals.',
      solution: 'Deotech Fix: Clean Edge SSR Reverse Proxy with sub-50ms TTFB.',
    },
  ],
  features: [
    {
      id: 'feat-outbox',
      title: 'Transactional Outbox Pattern',
      description:
        'Posts and delivery outbox records persist atomically in the same MongoDB session. Never miss a webhook delivery, even during network blips or client server downtime.',
      tag: 'Cryptographic Lease Fencing',
    },
    {
      id: 'feat-scheduling',
      title: 'Sleep-Resilient Scheduled Publishing',
      description:
        'Schedule articles for future release across timezones in UTC. Our atomic claim engine guarantees zero duplicate publishing, and internal cron endpoints wake up sleeping cloud containers.',
      tag: 'Timing-Safe Authentication',
    },
    {
      id: 'feat-embed',
      title: 'Universal Website Embedding',
      description:
        'Seamlessly attach your blog to WordPress, Next.js, Shopify, Laravel, Nuxt, or plain HTML. Single-line reverse proxy or API endpoints allow zero-code-change integrations.',
      tag: 'Sub-50ms Edge SSR',
    },
    {
      id: 'feat-rbac',
      title: 'Multi-Tenant RBAC & Isolation',
      description:
        'Distinct roles for Primary Admin, Client Admin, Content Writer, and Editor. Multi-tenant boundaries ensure client organizations never see each other\'s articles or settings.',
      tag: 'Granular Permission Matrix',
    },
    {
      id: 'feat-seo',
      title: 'Automated SEO & Schema Markup',
      description:
        'Generate flawless Google Article Schema (JSON-LD), OpenGraph social preview images, Twitter cards, and normalized canonical URLs automatically on every save.',
      tag: '100/100 Lighthouse SEO Score',
    },
    {
      id: 'feat-customizer',
      title: 'Visual Template & Brand Customizer',
      description:
        'Customize blog colors, layout grid/cards, brand typography, and preview live on desktop and mobile screens in real time with the built-in Simulator before publishing.',
      tag: 'Side-by-Side Live Simulator',
    },
  ],
  comparison: [
    {
      feature: 'Core Web Vitals & Load Speed',
      traditional: 'Bloated with 30+ plugins, 2.5s+ TTFB, slow SQL queries',
      deotech: 'Sub-50ms Edge SSR response, pure optimized HTML & CDN assets',
    },
    {
      feature: 'Webhook Reliability',
      traditional: 'Fires and forgets; if network hiccups, updates are lost forever',
      deotech: 'Atomic MongoDB Transactional Outbox + Exponential Retry Daemon',
    },
    {
      feature: 'Scheduled Blog Publishing',
      traditional: 'Relies on fragile WP-Cron (requires site traffic) or breaks on container sleep',
      deotech: 'Sleep-proof atomic claim engine with dedicated external cron auth (X-Cron-Key)',
    },
    {
      feature: 'Frontend Compatibility',
      traditional: 'Forced to use PHP templates or spend weeks rewriting headless adapters',
      deotech: 'Universal embed into Next.js, WordPress, Shopify, Laravel, Nuxt, or HTML',
    },
    {
      feature: 'Multi-Tenant Isolation',
      traditional: 'Requires separate server instances or complex multi-site databases',
      deotech: 'Native organization boundaries, RBAC matrices, and isolated workspaces',
    },
    {
      feature: 'SEO & Structured Data',
      traditional: 'Requires separate bulky SEO plugins with conflicting canonical tags',
      deotech: 'Built-in automated Schema.org, OpenGraph, Twitter Cards, and sitemaps',
    },
  ],
  guaranteeBanner: {
    title: '100% Risk-Free 14-Day Free Trial',
    subtitle:
      'Try any Deotech CMS tier free for two weeks. Full access to transactional outbox, API endpoints, and onboarding.',
    buttonText: 'Start Free Trial Now',
  },
  faqs: [
    {
      question: 'Why was Deotech CMS built instead of just using WordPress or Ghost?',
      answer:
        'Traditional monolithic platforms like WordPress suffer from heavy PHP bloat, slow database queries, security holes, and fragile plugin chains that break on minor updates. Meanwhile, generic headless CMSs charge exorbitant enterprise fees and leave you stranded with dual-write bugs—where a post saves in the CMS but drops the webhook notification. Deotech CMS was engineered from scratch to bridge this gap: offering universal headless embedding into any tech stack, guaranteed zero-data-loss transactional outbox delivery, sleep-proof automated scheduled publishing, and sub-50ms edge SSR performance.',
    },
    {
      question: 'How does the Transactional Outbox guarantee 100% reliable webhook delivery?',
      answer:
        'When you publish or edit a post, the status update and the webhook outbox record are committed atomically inside the exact same MongoDB transaction session. Once committed, an atomic lease claim is generated with a unique cryptographic token. If your receiving client server is temporarily down, our background retry daemon automatically intervenes with exponential backoff and lease fencing, preventing both dropped deliveries and duplicate notifications.',
    },
    {
      question: 'Will scheduled blog publishing work if our hosting container (e.g. Render Free) goes to sleep?',
      answer:
        'Yes! We specifically architected the scheduling engine for real-world cloud environments. In addition to the internal in-process daemon, we provide a secure, authenticated internal cron endpoint (/api/v1/internal/scheduled/run) protected by timingSafeEqual comparison and a dedicated CRON_SECRET header (X-Cron-Key). An external ping service (like Cron-Job.org or UptimeRobot) wakes up sleeping containers, immediately triggering overdue publishing runs with zero risk of duplicate execution.',
    },
    {
      question: 'Can we connect multiple different client websites to a single Deotech CMS instance?',
      answer:
        'Yes. Deotech CMS features native multi-tenant architecture. Super Admins and Client Admins can onboard separate client organizations, assign isolated content writers, map custom domains, configure distinct theme color tokens, and monitor delivery health independently without cross-tenant data leakage.',
    },
    {
      question: 'How does the Reverse Proxy integration protect SEO and Core Web Vitals?',
      answer:
        'Unlike fragile client-side iframes or JavaScript-only widgets that search engines struggle to index, Deotech CMS provides an Edge Reverse Proxy architecture. Your client website (Next.js, WordPress, Express, Shopify, or Laravel) serves the blog under your primary domain (e.g., yourdomain.com/blog). Search engine crawlers receive fully server-side rendered HTML, automated Schema.org Article JSON-LD markup, OpenGraph metadata, and canonical tags, achieving 100/100 Core Web Vitals.',
    },
    {
      question: 'Can we switch plans or cancel our subscription at any time?',
      answer:
        'Yes, you can upgrade, downgrade, or cancel your subscription plan at any time directly from your Account Settings. If you switch to an annual plan, you instantly save 20% and receive 2 full months free of charge.',
    },
  ],
  ctaBanner: {
    title: 'Ready to Build a High-Speed, Zero-Downtime Blog?',
    subtitle:
      'Join hundreds of forward-thinking engineering and content teams. Start your 14-day free trial today.',
    primaryButtonText: 'Start Free 14-Day Trial',
    secondaryButtonText: 'Explore Website Setup',
    noteText: 'No credit card required • 5-minute setup • Full API & Swagger access',
  },
  footer: {
    brandDescription:
      'The enterprise headless & reverse-proxy CMS engineered for zero data loss, guaranteed transactional outbox delivery, and sleep-proof automated scheduled publishing.',
    statusText: 'Crafted by Deotech Solutions • All systems operational',
    copyrightText: 'Deotech Solutions Inc. All rights reserved.',
    tagline:
      'The enterprise headless & reverse-proxy CMS engineered for zero data loss, guaranteed transactional outbox delivery, and sleep-proof automated scheduled publishing.',
  },
  updatedBy: 'SuperAdmin',
}

export const defaultSubscriptionPlans = [
  {
    planId: 'starter',
    name: 'Starter / Solo Creator',
    tagline: 'Ideal for indie hackers, personal bloggers, and emerging projects.',
    monthlyPriceUSD: 19,
    annualPriceUSD: 15,
    monthlyPriceINR: 1499,
    annualPriceINR: 1199,
    isPopular: false,
    isActive: true,
    buttonText: 'Get Started Free',
    badge: '14-Day Free Trial',
    sortOrder: 1,
    features: [
      '1 Connected Website Domain',
      'Up to 3 Content Writers & Editors',
      'Unlimited Blog Posts & Drafts',
      'Rich Text & Markdown Editor',
      'Built-in Media Storage (2 GB)',
      'Standard Webhook Notifications',
      'Automated SEO Meta & OpenGraph Tags',
      'Community Support & Documentation',
    ],
    missingFeatures: [
      'Transactional Outbox with Guaranteed Delivery',
      'Sleep-Proof Scheduled Publishing Engine',
      'Multi-Tenant Organization Workspaces',
      'Custom Domain SSL Reverse Proxy',
    ],
  },
  {
    planId: 'professional',
    name: 'Professional / Growth',
    tagline: 'Engineered for scaling businesses, SaaS products, and marketing teams.',
    monthlyPriceUSD: 49,
    annualPriceUSD: 39,
    monthlyPriceINR: 3999,
    annualPriceINR: 3199,
    isPopular: true,
    isActive: true,
    buttonText: 'Start 14-Day Free Trial',
    badge: 'Most Popular',
    sortOrder: 2,
    features: [
      'Up to 5 Connected Websites / Domains',
      'Up to 15 Content Writers & Team Members',
      'Guaranteed Transactional Outbox Delivery',
      'Automatic Retry Daemon with Exponential Backoff',
      'Automated Scheduled Publishing (Sleep-Container Safe)',
      'Reverse Proxy SSR Edge Integration (Next.js, WP, Shopify)',
      'Custom Domain Mapping & Auto-SSL Verification',
      'Granular Role-Based Permissions (RBAC Matrix)',
      'Media Storage (25 GB) with High-Speed CDN',
      'Priority Email & Chat Support (99.9% Uptime SLA)',
    ],
    missingFeatures: [
      'White-Label Client Branding & Portal',
      'Dedicated External Cron Secret API',
    ],
  },
  {
    planId: 'enterprise',
    name: 'Enterprise / Agency',
    tagline: 'Designed for digital agencies, high-traffic publications, and multi-brand enterprises.',
    monthlyPriceUSD: 149,
    annualPriceUSD: 119,
    monthlyPriceINR: 11999,
    annualPriceINR: 9499,
    isPopular: false,
    isActive: true,
    buttonText: 'Get Enterprise Access',
    badge: 'Ultimate Power',
    sortOrder: 3,
    features: [
      'Unlimited Connected Websites & Client Portals',
      'Unlimited Writers, Editors & Organization Admins',
      'Multi-Tenant Client Organizations & Isolated Workspaces',
      'Dedicated Internal Cron Trigger API (X-Cron-Key / Render Free Support)',
      'Custom Webhook Endpoints with HMAC SHA-256 Signatures',
      'White-Label Blog Engine & Dynamic Visual Theme Builder',
      'Full System Audit Logs & Immutable Revision History',
      'Media Storage (250 GB+) & Custom AWS S3 / Cloudflare R2',
      'Dedicated Solutions Architect & 24/7 Phone Support',
      '99.99% Uptime SLA with Custom Legal Contract',
    ],
    missingFeatures: [],
  },
]

