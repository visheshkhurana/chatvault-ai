const BRIDGE_URL = process.env.NEXT_PUBLIC_BRIDGE_URL || 'https://chatvault-ai-production.up.railway.app';
const BRIDGE_ORIGIN = (() => {
    try {
        return new URL(BRIDGE_URL).origin;
    } catch {
        return 'https://chatvault-ai-production.up.railway.app';
    }
})();

const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    `connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co https://api.openai.com https://*.backblazeb2.com https://*.railway.app ${BRIDGE_ORIGIN}`,
    `frame-src 'self' https://*.railway.app ${BRIDGE_ORIGIN}`,
    "frame-ancestors 'none'",
].join('; ');

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
    typescript: {
        ignoreBuildErrors: true,
    },
    eslint: {
        ignoreDuringBuilds: true,
    },
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: [
                    {
                        key: 'X-Frame-Options',
                        value: 'DENY',
                    },
                    {
                        key: 'X-Content-Type-Options',
                        value: 'nosniff',
                    },
                    {
                        key: 'Referrer-Policy',
                        value: 'strict-origin-when-cross-origin',
                    },
                    {
                        key: 'X-XSS-Protection',
                        value: '1; mode=block',
                    },
                    {
                        key: 'Permissions-Policy',
                        value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
                    },
                    {
                        key: 'Strict-Transport-Security',
                        value: 'max-age=63072000; includeSubDomains; preload',
                    },
                    {
                        key: 'Content-Security-Policy',
                        value: CONTENT_SECURITY_POLICY,
                    },
                ],
            },
        ];
    },
};

module.exports = nextConfig;
