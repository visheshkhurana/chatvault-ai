/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
          serverComponentsExternalPackages: ['tesseract.js', 'pdf-parse'],
    },
    images: {
          remotePatterns: [
            {
                      protocol: 'https',
                      hostname: '*.backblazeb2.com',
            },
                ],
    },
    // Vercel serverless function config
    serverRuntimeConfig: {
          maxDuration: 60, // 60 seconds for processing
    },
};

module.exports = nextConfig;
