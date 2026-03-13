'use client';

import { WalletProviderClient } from '@/lib/wallet-provider';

export function Providers({ children }: { children: React.ReactNode }) {
  return <WalletProviderClient>{children}</WalletProviderClient>;
}
