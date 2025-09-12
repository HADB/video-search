// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  css: [
    '~/assets/main.css',
  ],
  devtools: { enabled: true },
  eslint: { config: { standalone: false } },
  modules: ['@nuxt/eslint', '@nuxt/ui'],
  ssr: false,
  colorMode: {
    preference: 'dark',
    fallback: 'dark',
  },
})
