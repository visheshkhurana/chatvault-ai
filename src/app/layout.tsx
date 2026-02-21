import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'ChatVault AI - WhatsApp Memory Layer',
    description: 'Search, recall, and summarize your WhatsApp conversations with AI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
          <html lang="en">
                <body className={inter.className}>{children}</body>body>
          </html>html>
        );
}</html>
