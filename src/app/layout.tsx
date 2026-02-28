import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import PWAInstallPrompt from '@/components/PWAInstallPrompt';

const inter = Inter({ subsets: ['latin'] });

export const viewport: Viewport = {
    themeColor: '#16A34A',
    width: 'device-width',
    initialScale: 1,
};

export const metadata: Metadata = {
    title: {
        default: 'Rememora — AI-Powered WhatsApp Memory',
        template: '%s | Rememora',
    },
    description:
        'Turn your WhatsApp into a searchable knowledge base. Find any message, document, or conversation with AI-powered semantic search. Free to get started.',
    keywords: [
        'WhatsApp search',
        'WhatsApp backup',
        'message search',
        'AI search',
        'WhatsApp memory',
        'chat search',
        'semantic search',
        'WhatsApp organizer',
        'conversation search',
        'WhatsApp AI',
    ],
    authors: [{ name: 'Rememora' }],
    creator: 'Rememora',
    metadataBase: new URL('https://chatvault-ai.vercel.app'),
    openGraph: {
        type: 'website',
        locale: 'en_US',
        url: 'https://chatvault-ai.vercel.app',
        siteName: 'Rememora',
        title: 'Rememora — Never Lose a WhatsApp Message Again',
        description:
            'AI-powered WhatsApp memory. Search by meaning, get instant summaries, track commitments — all from your conversations.',
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: 'Rememora — AI-Powered WhatsApp Memory',
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Rememora — AI-Powered WhatsApp Memory',
        description:
            'Turn your WhatsApp into a searchable knowledge base. Find any message instantly with AI.',
        images: ['/og-image.png'],
    },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            'max-video-preview': -1,
            'max-image-preview': 'large',
            'max-snippet': -1,
        },
    },
    manifest: '/manifest.json',
    icons: {
        icon: '/favicon.svg',
        apple: '/icons/icon-192.png',
    },
    appleWebApp: {
        capable: true,
        statusBarStyle: 'default',
        title: 'Rememora',
    },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <head>
                <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
            </head>
            <body className={inter.className}>
                <ErrorBoundary>
                    {children}
                    <PWAInstallPrompt />
                </ErrorBoundary>
            </body>
        </html>
    );
}
