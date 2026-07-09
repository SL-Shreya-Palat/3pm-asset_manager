import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { AuthInitializer } from '@/components/providers/auth-initializer';
import { TooltipProvider } from '@/components/ui/tooltip';
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
        </AuthInitializer>
      </body>
    </html>
  );
}
