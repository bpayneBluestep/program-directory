import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const repoRoot = dirname(fileURLToPath(import.meta.url))

// GitSite contract:
//   - Routes live at the host root (/, /claim/:id, /portal, /admin): the root
//     mount serves index.html for extensionless browser navigations.
//   - Assets must stay under "/spa/", the only mount that streams files (the
//     root mount 404s anything with an extension), so the build `base` is
//     "/spa/". Dev serves from "/".
//   - The deploy artifact is the *committed build output at the repo root*
//     (default INDEX_PATH = "index.html"). Source lives in ./app; the build
//     emits index.html + assets/ to the repo root.
export default defineConfig(({ command }) => ({
  root: 'app',
  base: command === 'build' ? '/spa/' : '/',
  plugins: [react()],
  build: {
    // Emit the built SPA to the repository root so the zipball root IS the
    // artifact root. `emptyOutDir: false` because outDir is above `root`;
    // scripts/clean-artifact.mjs removes stale output before each build.
    outDir: resolve(repoRoot),
    emptyOutDir: false,
  },
}))
