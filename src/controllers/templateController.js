import asyncHandler from '../utils/asyncHandler.js'
import AppError from '../utils/AppError.js'
import { sendSuccess } from '../utils/helpers.js'
import { getBlogSetupSetting, saveBlogSetupSetting } from '../services/blogSetupSettings.js'

// Initial seed configurations for template builder
const defaultTemplate = {
  version: '',
  status: 'draft',
  sections: [
    {
      id: 'headerBanner',
      name: 'Header Banner',
      type: 'banner',
      enabled: true,
      description: 'Hero announcement banner with title, description, and search bar.',
      config: {
        style: 'centered',
        showSubtitle: true,
        showSearchBar: true,
        headline: 'Insights, Perspectives & Stories',
        subtitle: 'Discover actionable articles, technical deep-dives, and industry perspectives from our authors.',
      },
    },
    {
      id: 'featuredPosts',
      name: 'Featured Posts',
      type: 'featured',
      enabled: true,
      description: 'Highlight marquee stories in high-impact hero or carousel layouts.',
      config: {
        layout: 'heroSplit',
        count: 3,
        showBadges: true,
        showExcerpt: true,
      },
    },
    {
      id: 'categoryNav',
      name: 'Category Navigation',
      type: 'categoryNav',
      enabled: true,
      description: 'Quick-filter category taxonomy navigation bar.',
      config: {
        style: 'pills',
        showCounts: true,
        sticky: false,
      },
    },
    {
      id: 'latestPosts',
      name: 'Latest Posts',
      type: 'latest',
      enabled: true,
      description: 'Main article feed with custom columns, card styles, and pagination.',
      config: {
        columns: 3,
        cardStyle: 'modern',
        postsPerPage: 6,
        pagination: 'numbers',
        showReadTime: true,
        showAuthor: true,
      },
    },
    {
      id: 'popularPosts',
      name: 'Popular Posts',
      type: 'popular',
      enabled: true,
      description: 'Trending and most-read publications showcase.',
      config: {
        position: 'sidebar',
        cardStyle: 'rankedList',
        count: 4,
      },
    },
    {
      id: 'ctaBanner',
      name: 'Call-to-Action Banner',
      type: 'cta',
      enabled: true,
      description: 'Lead generation and newsletter email signup box.',
      config: {
        headline: 'Subscribe to Our Editorial Newsletter',
        subtext: 'Join thousands of professionals receiving weekly curated articles and insights.',
        buttonText: 'Join Newsletter',
        style: 'boxed',
      },
    },
  ],
  categoryConfig: {
    navStyle: 'pills',
    headerStyle: 'banner',
    columns: 3,
    cardStyle: 'modern',
    showFilterSort: true,
    postsPerPage: 6,
    showCategoryDescription: true,
  },
  singlePostConfig: {
    headerLayout: 'standard',
    bodyWidth: 'editorial',
    showAuthorBio: true,
    showPublishDate: true,
    showReadTime: true,
    showCategoryTag: true,
    showSocialShare: true,
    showSidebar: true,
    sidebarWidgets: {
      toc: true,
      authorCard: true,
      relatedArticles: true,
    },
    showRelatedPosts: true,
    relatedCount: 3,
    showComments: true,
  },
}

// Get active template layout
export const getTemplate = asyncHandler(async (req, res) => {
  const template = await getBlogSetupSetting('template', 'global', defaultTemplate)
  return sendSuccess(res, template, 'Master blog template retrieved')
})

// Update template draft
export const updateTemplate = asyncHandler(async (req, res) => {
  const { sections, categoryConfig, singlePostConfig } = req.body
  const template = await getBlogSetupSetting('template', 'global', defaultTemplate)
  if (sections) template.sections = sections
  if (categoryConfig) template.categoryConfig = categoryConfig
  if (singlePostConfig) template.singlePostConfig = singlePostConfig
  template.status = 'draft'
  await saveBlogSetupSetting('template', 'global', template)

  return sendSuccess(res, template, 'Template updated successfully')
})

// Publish new template version
export const publishTemplate = asyncHandler(async (req, res, next) => {
  const { version, notes } = req.body
  if (!version) return next(new AppError('Please provide release version tag (e.g. v2.5)', 400))

  const template = await getBlogSetupSetting('template', 'global', defaultTemplate)
  const newVer = {
    version,
    status: 'active',
    publishedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
    publishedBy: req.user?.name || 'SuperAdmin',
    notes: notes || 'Published template updates',
    template: JSON.parse(JSON.stringify(template)),
  }

  template.version = version
  template.status = 'active'
  await saveBlogSetupSetting('template', 'global', template)
  const versions = await getBlogSetupSetting('template-versions', 'global', [])
  await saveBlogSetupSetting('template-versions', 'global', [newVer, ...versions.filter((item) => item.version !== version)])

  return sendSuccess(res, { template, release: newVer }, `Template ${version} published successfully`, 201)
})

// Get template version history
export const getTemplateVersions = asyncHandler(async (req, res) => {
  const versions = await getBlogSetupSetting('template-versions', 'global', [])
  return sendSuccess(res, versions.map(({ template, ...release }) => release), 'Template version releases retrieved')
})

// Rollback template to specific release version
export const rollbackTemplate = asyncHandler(async (req, res, next) => {
  const { version } = req.params
  const versions = await getBlogSetupSetting('template-versions', 'global', [])
  const target = versions.find((item) => item.version === version)
  if (!target) return next(new AppError(`Release version ${version} not found in history`, 404))

  const template = { ...(target.template || defaultTemplate), version, status: 'active' }
  await saveBlogSetupSetting('template', 'global', template)
  await saveBlogSetupSetting('template-versions', 'global', versions.map((item) => ({
    ...item,
    status: item.version === version ? 'active' : 'archived',
  })))
  return sendSuccess(res, template, `Rolled back to template version ${version}`)
})

// Reset template to default master baseline
export const resetTemplate = asyncHandler(async (req, res) => {
  const template = JSON.parse(JSON.stringify(defaultTemplate))
  await saveBlogSetupSetting('template', 'global', template)
  await saveBlogSetupSetting('template-versions', 'global', [])
  return sendSuccess(res, template, 'Template configurations restored to defaults')
})
