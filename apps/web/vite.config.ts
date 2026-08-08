import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    // Without this, Node/vite resolves "localhost" to the IPv6 loopback
    // only ([::1]) on this machine, so IPv4 clients (127.0.0.1, and
    // dev.bat's own readiness probe) can never connect even though the
    // server logs "ready". `host: true` binds every interface (IPv4 and
    // IPv6) instead of just one.
    host: true,
  },
})
