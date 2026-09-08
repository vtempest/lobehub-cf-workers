import { createMDX } from 'fumadocs-mdx/next'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const withMDX = createMDX()

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Image optimization is handled by the Cloudflare Images binding in
  // worker/index.ts, not by Next's Node-based optimizer.
  images: {
    unoptimized: true,
  },
  reactStrictMode: true,
  // Shiki ships prebuilt WASM/JSON grammars that must not be bundled into the
  // RSC graph.
  serverExternalPackages: ['shiki'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'fumadocs-mdx:collections/server': path.resolve(__dirname, '.source/server.ts'),
      }
    }
    return config
  },
}

export default withMDX(nextConfig)
