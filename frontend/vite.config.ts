import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

/**
 * En desarrollo el frontend consume el backend local por defecto.
 * Si se necesita otro destino, puede sobrescribirse con `VITE_API_PROXY_TARGET`.
 */
const DEFAULT_API_PROXY_TARGET = 'http://localhost:3002'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || DEFAULT_API_PROXY_TARGET

  return {
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used â€“ do not remove them
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: apiProxyTarget.startsWith('https'),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/app'),
    },
  },
  build: {
    chunkSizeWarningLimit: 450,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          // Core framework/runtime
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
            return 'vendor-react'
          }

          // Routing
          if (id.includes('/react-router/')) {
            return 'vendor-router'
          }

          // UI system
          if (id.includes('/@radix-ui/') || id.includes('/lucide-react/') || id.includes('/class-variance-authority/') || id.includes('/clsx/') || id.includes('/tailwind-merge/')) {
            return 'vendor-ui'
          }

          // Charts and heavy visualization dependencies
          if (id.includes('/recharts/') || id.includes('/d3-')) {
            return 'vendor-charts'
          }

          // Drag and drop
          if (id.includes('/react-dnd/') || id.includes('/dnd-core/') || id.includes('/react-dnd-html5-backend/')) {
            return 'vendor-dnd'
          }

          // Forms and validation
          if (id.includes('/react-hook-form/')) {
            return 'vendor-forms'
          }

          // Date handling
          if (id.includes('/date-fns/') || id.includes('/react-day-picker/')) {
            return 'vendor-dates'
          }

          // MUI ecosystem
          if (id.includes('/@mui/') || id.includes('/@emotion/')) {
            return 'vendor-mui'
          }

          // Fallback chunk for remaining dependencies
          return 'vendor-misc'
        },
      },
    },
  },
  }
})

