import type { Metadata } from 'next';
import '@solana/wallet-adapter-react-ui/styles.css';
import './globals.css';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'Solana Stablecoin Standard UI',
  description: 'Example frontend for managing SSS-1 and SSS-2 stablecoins with the TypeScript SDK.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="bg-[#Fdfdfc] text-neutral-900 antialiased selection:bg-neutral-900 selection:text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
