import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { AuthInitializer } from '@/components/providers/auth-initializer';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PwaProvider } from '@/components/pwa/pwa-provider';
import { Toaster } from 'sonner';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: '3PM Drive',
  description: 'Fleet management platform',
  applicationName: '3PM Drive',
  appleWebApp: {
    capable: true,
    title: '3PM Drive',
    statusBarStyle: 'default',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ea580c',
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body
        className={`${geistSans.variable} ${geistMono.variable} h-full overflow-hidden bg-background font-sans`}
      >
        <AuthInitializer>
          <TooltipProvider delayDuration={0}>
            {children}
          </TooltipProvider>
          <Toaster position="top-right" />
          <PwaProvider />
        </AuthInitializer>
      </body>
    </html>
  );
}
