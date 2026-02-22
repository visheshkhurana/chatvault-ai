import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'Rememora - WhatsApp Memory Layer',
    description: 'Search, recall, and summarize your WhatsApp conversations with AI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
          <html lang="en">
                <body className={inter.className}>
                    <ErrorBoundary>{children}</ErrorBoundary>
                </body>
          </html>
        );
}
