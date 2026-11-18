import mongoose from 'mongoose'

const landingPageConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'main_landing_page',
      trim: true,
    },
    header: {
      brandName: { type: String, default: 'Deotech' },
      brandHighlight: { type: String, default: 'CMS' },
      brandBadge: { type: String, default: 'Enterprise Headless Suite' },
      signInText: { type: String, default: 'Sign In' },
      freeTrialText: { type: String, default: 'Start Free Trial' },
      dashboardText: { type: String, default: 'Dashboard' },
    },
    announcement: {
      enabled: { type: Boolean, default: true },
      badge: { type: String, default: 'New in Phase 2B' },
      text: {
        type: String,
        default: 'Zero Data Loss Transactional Outbox & Sleep-Proof Scheduled Publishing are live!',
      },
      linkText: { type: String, default: 'See how it works →' },
      linkUrl: { type: String, default: '#architecture' },
    },
    hero: {
      pillBadge: {
        type: String,
        default: 'Next-Gen Headless & Reverse-Proxy Engine',
      },
      pillSubtext: {
        type: String,
        default: 'Phase 2B Reliability Verified',
      },
      title: {
        type: String,
        default: 'The High-Performance CMS Built for Zero Data Loss & Universal Web Publishing',
      },
      highlightWords: {
        type: String,
        default: 'Zero Data Loss',
      },
      subtitle: {
        type: String,
        default:
          'Empower your marketing and engineering teams to embed lightning-fast blogs into any website—WordPress, Next.js, Shopify, or Laravel. Eliminate webhook drops with transactional outbox staging and publish scheduled blogs flawlessly, even when free cloud containers sleep.',
      },
      primaryCtaText: { type: String, default: 'Start 14-Day Free Trial' },
      primaryCtaLink: { type: String, default: '/register' },
      secondaryCtaText: { type: String, default: 'View Pricing & Rates' },
      secondaryCtaLink: { type: String, default: '#pricing' },
      docsCtaText: { type: String, default: 'Swagger Docs' },
      docsCtaLink: { type: String, default: '/api-docs' },
      heroImageUrl: { type: String, default: '' },
    },
    trustBadges: [
      {
        title: { type: String, default: '' },
        subtitle: { type: String, default: '' },
        iconType: { type: String, default: 'shield' },
      },
    ],
    sectionsMeta: {
      whyUsBadge: { type: String, default: 'The Mission Behind Deotech CMS' },
      whyUsHeading: { type: String, default: 'Why We Built Deotech CMS' },
      whyUsSubtitle: {
        type: String,
        default:
          'For over a decade, teams were forced to compromise: endure slow, plugin-heavy WordPress monoliths or struggle with decoupled headless systems plagued by dropped webhooks and missed scheduled publishing.',
      },
      featuresBadge: { type: String, default: 'How Deotech CMS Helps Your Business' },
      featuresHeading: { type: String, default: 'Engineered for Speed, Reliability & Scale' },
      featuresSubtitle: {
        type: String,
        default:
          'Everything your editorial team and engineering department need to publish with complete confidence.',
      },
      architectureBadge: { type: String, default: 'Under The Hood' },
      architectureHeading: { type: String, default: 'Enterprise Reliability Architecture' },
      architectureSubtitle: {
        type: String,
        default:
          'Explore how Deotech CMS eliminates edge-case race conditions, guarantees delivery, and integrates anywhere.',
      },
      comparisonBadge: { type: String, default: 'Direct Comparison' },
      comparisonHeading: { type: String, default: 'Traditional CMS vs. Deotech Unified CMS' },
      comparisonSubtitle: {
        type: String,
        default:
          'See why leading agencies and digital publishers are moving away from bloated monoliths.',
      },
      pricingBadge: { type: String, default: 'Transparent, Value-Driven Plans' },
      pricingHeading: { type: String, default: 'Choose the Plan That Fits Your Scale' },
      pricingSubtitle: {
        type: String,
        default:
          'Start with a 14-day free trial on any tier. No surprise fees. Upgrade or cancel anytime.',
      },
      faqBadge: { type: String, default: 'Got Questions?' },
      faqHeading: { type: String, default: 'Frequently Asked Questions' },
      faqSubtitle: {
        type: String,
        default:
          'Everything you need to know about Deotech CMS, webhooks, sleeping containers, and pricing.',
      },
    },
    whyUs: [
      {
        id: { type: String },
        title: { type: String, required: true },
        description: { type: String, required: true },
        solution: { type: String, required: true },
      },
    ],
    features: [
      {
        id: { type: String },
        title: { type: String, required: true },
        description: { type: String, required: true },
        tag: { type: String, default: '' },
      },
    ],
    comparison: [
      {
        feature: { type: String, required: true },
        traditional: { type: String, required: true },
        deotech: { type: String, required: true },
      },
    ],
    guaranteeBanner: {
      title: { type: String, default: '100% Risk-Free 14-Day Free Trial' },
      subtitle: {
        type: String,
        default:
          'Try any Deotech CMS tier free for two weeks. Full access to transactional outbox, API endpoints, and onboarding.',
      },
      buttonText: { type: String, default: 'Start Free Trial Now' },
    },
    faqs: [
      {
        question: { type: String, required: true },
        answer: { type: String, required: true },
      },
    ],
    ctaBanner: {
      title: {
        type: String,
        default: 'Ready to Build a High-Speed, Zero-Downtime Blog?',
      },
      subtitle: {
        type: String,
        default:
          'Join hundreds of forward-thinking engineering and content teams. Start your 14-day free trial today.',
      },
      primaryButtonText: { type: String, default: 'Start Free 14-Day Trial' },
      secondaryButtonText: { type: String, default: 'Explore Website Setup' },
      noteText: {
        type: String,
        default: 'No credit card required • 5-minute setup • Full API & Swagger access',
      },
    },
    footer: {
      brandDescription: {
        type: String,
        default:
          'The enterprise headless & reverse-proxy CMS engineered for zero data loss, guaranteed transactional outbox delivery, and sleep-proof automated scheduled publishing.',
      },
      statusText: {
        type: String,
        default: 'Crafted by Deotech Solutions • All systems operational',
      },
      copyrightText: {
        type: String,
        default: 'Deotech Solutions Inc. All rights reserved.',
      },
      tagline: {
        type: String,
        default:
          'The enterprise headless & reverse-proxy CMS engineered for zero data loss, guaranteed transactional outbox delivery, and sleep-proof automated scheduled publishing.',
      },
    },
    updatedBy: { type: String, default: 'SuperAdmin' },
  },
  {
    timestamps: true,
  }
)

const LandingPageConfig =
  mongoose.models.LandingPageConfig ||
  mongoose.model('LandingPageConfig', landingPageConfigSchema)

export default LandingPageConfig
