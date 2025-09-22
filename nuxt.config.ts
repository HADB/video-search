// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  colorMode: {
    preference: 'dark',
    fallback: 'dark',
  },
  compatibilityDate: '2025-07-15',
  css: [
    '~/assets/main.css',
  ],
  devtools: { enabled: true },
  eslint: { config: { standalone: false } },
  fonts: {
    provider: 'local',
  },
  icon: {
    serverBundle: 'local',
    customCollections: [
      {
        prefix: 'custom',
        dir: './app/assets/icons',
      },
    ],
  },
  modules: ['@nuxt/eslint', '@nuxt/ui'],
  ssr: false,
})
