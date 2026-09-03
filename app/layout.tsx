import type { Metadata } from 'next';
import './globals.css';

const SITE_ORIGIN = 'https://beat-z.jbm111.chatgpt.site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: 'Beat.Z',
  description: 'Build, audition, and shape audio primitives through a focused visual signal chain.',
  alternates: { canonical: SITE_ORIGIN },
  openGraph: {
    title: 'Beat.Z',
    description: 'Shape sound. Expose controls. Build the signal path.',
    type: 'website',
    url: SITE_ORIGIN,
    images: [{ url: `${SITE_ORIGIN}/og.png`, width: 1731, height: 909, alt: 'Beat.Z signal chain' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Beat.Z',
    description: 'Shape sound. Expose controls. Build the signal path.',
    images: [`${SITE_ORIGIN}/og.png`],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
