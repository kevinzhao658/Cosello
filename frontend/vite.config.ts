import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/uploads': 'http://localhost:8000',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-router')) return 'react-vendor'
            if (id.includes('/react/') || id.includes('/react-dom/')) return 'react-vendor'
            if (id.includes('@radix-ui')) return 'radix-vendor'
            if (id.includes('@mui') || id.includes('@emotion') || id.includes('@popperjs')) return 'mui-vendor'
            if (id.includes('@supabase')) return 'supabase'
            if (
              id.includes('recharts') ||
              id.includes('embla-carousel') ||
              id.includes('react-day-picker') ||
              id.includes('react-slick') ||
              id.includes('react-responsive-masonry')
            ) return 'charts-and-carousel'
            if (
              id.includes('react-hook-form') ||
              id.includes('date-fns') ||
              id.includes('clsx') ||
              id.includes('tailwind-merge') ||
              id.includes('class-variance-authority') ||
              id.includes('input-otp')
            ) return 'forms-and-utils'
            if (
              id.includes('/motion/') ||
              id.includes('sonner') ||
              id.includes('vaul') ||
              id.includes('cmdk') ||
              id.includes('next-themes') ||
              id.includes('lucide-react')
            ) return 'motion-and-overlays'
            if (id.includes('react-dnd')) return 'dnd'
          }
        },
      },
    },
  },
})
