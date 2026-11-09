import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'apk.js',
  description: '在浏览器中运行 Android APK 的 JavaScript 模拟器',
  lang: 'en-US',
  base: '/apk.js/',
  cleanUrls: false,
  head: [
    ['meta', { name: 'theme-color', content: '#0b0d12' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
  ],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/introduction', activeMatch: '^/guide/' },
      { text: 'API', link: '/api/simulator', activeMatch: '^/api/' },
      { text: 'Internals', link: '/internals/architecture', activeMatch: '^/internals/' },
      {
        text: 'Playground',
        link: '/playground',
        target: '_self',
      },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Getting started',
          items: [
            { text: 'Introduction', link: '/guide/introduction' },
            { text: 'Quick start', link: '/guide/quick-start' },
            { text: 'Embedding', link: '/guide/embedding' },
          ],
        },
        {
          text: 'Reference',
          items: [
            { text: 'Features', link: '/guide/features' },
            { text: 'Limitations', link: '/guide/limitations' },
            { text: 'Testing', link: '/guide/testing' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API',
          items: [
            { text: 'Simulator options', link: '/api/simulator' },
            { text: 'Methods', link: '/api/methods' },
          ],
        },
      ],
      '/internals/': [
        {
          text: 'Internals',
          items: [
            { text: 'Architecture', link: '/internals/architecture' },
            { text: 'DEX interpreter', link: '/internals/dex' },
            { text: 'Framework subset', link: '/internals/framework' },
            { text: 'Framework coverage', link: '/framework-coverage' },
          ],
        },
      ],
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/caofangkuai/apk.js' }],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Everything starts with apk.js',
    },
    outline: { level: [2, 3] },
  },
  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
    },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      title: 'apk.js',
      description: '在浏览器中运行 Android APK 的 JavaScript 模拟器',
      themeConfig: {
        nav: [
          { text: '指南', link: '/zh/guide/introduction', activeMatch: '^/zh/guide/' },
          { text: 'API', link: '/zh/api/simulator', activeMatch: '^/zh/api/' },
          { text: '内部实现', link: '/zh/internals/architecture', activeMatch: '^/zh/internals/' },
          { text: 'Playground', link: '/playground.html', target: '_self' },
        ],
        sidebar: {
          '/zh/guide/': [
            {
              text: '快速上手',
              items: [
                { text: '简介', link: '/zh/guide/introduction' },
                { text: '快速开始', link: '/zh/guide/quick-start' },
                { text: '嵌入页面', link: '/zh/guide/embedding' },
              ],
            },
            {
              text: '参考',
              items: [
                { text: '功能特性', link: '/zh/guide/features' },
                { text: '限制', link: '/zh/guide/limitations' },
                { text: '测试', link: '/zh/guide/testing' },
              ],
            },
          ],
          '/zh/api/': [
            {
              text: 'API',
              items: [
                { text: '模拟器选项', link: '/zh/api/simulator' },
                { text: '方法', link: '/zh/api/methods' },
              ],
            },
          ],
          '/zh/internals/': [
            {
              text: '内部实现',
              items: [
                { text: '架构', link: '/zh/internals/architecture' },
                { text: 'DEX 解释器', link: '/zh/internals/dex' },
                { text: 'Framework 子集', link: '/zh/internals/framework' },
                { text: 'Framework 覆盖矩阵', link: '/zh/framework-coverage' },
              ],
            },
          ],
        },
        outline: { level: [2, 3], label: '本页目录' },
        docFooter: { prev: '上一篇', next: '下一篇' },
        returnToTopLabel: '回到顶部',
        sidebarMenuLabel: '菜单',
        darkModeSwitchLabel: '主题',
        footer: {
          message: '基于 MIT 许可发布。',
          copyright: '一切开始，尽在 apk.js',
        },
      },
    },
  },
});
