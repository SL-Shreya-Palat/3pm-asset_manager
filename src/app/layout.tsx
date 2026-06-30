import type { Metadata } from 'next';
import { AuthInitializer } from '@/components/providers/auth-initializer';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

export const metadata: Metadata = {
  title: 'Asset Manager',
  description: 'Fleet asset management platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-full overflow-hidden bg-background text-foreground font-sans">
        <AuthInitializer>
          <TooltipProvider delayDuration={0}>
            {children}
          </TooltipProvider>
        </AuthInitializer>
      </body>
    </html>
  );
}
