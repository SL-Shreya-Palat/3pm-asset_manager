import type { MetadataRoute } from 'next';

/**
 * PWA web app manifest — served at /manifest.webmanifest.
 * Makes the app installable on Android/iOS home screens so drivers can
 * launch inspections like a native app.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '3PM Drive',
    short_name: 'Drive',
    description: 'Fleet management — inspections, maintenance and assets',
    start_url: '/dashboard',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#ea580c',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
