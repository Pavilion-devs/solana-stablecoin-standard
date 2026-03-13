'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardShell } from '@/components/DashboardShell';
import { useWalletClient } from '@/lib/wallet-provider';

export default function DashboardPage() {
  const router = useRouter();
  const { connected, address, disconnect, walletAvailable, connecting, error: walletError } = useWalletClient();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!connecting && !connected) {
      router.replace('/');
    }
  }, [mounted, connecting, connected, router]);

  const onDisconnect = async () => {
    await disconnect();
    router.replace('/');
  };

  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#Fdfdfc] text-neutral-500">
        Loading operator console...
      </div>
    );
  }

  if (!walletAvailable) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-[#Fdfdfc] text-neutral-600">
        <p>No Solana wallet detected. Install Phantom or Solflare and reload.</p>
      </div>
    );
  }

  if (walletError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-[#Fdfdfc] text-neutral-600">
        <p>{walletError}</p>
        <button
          className="rounded-full bg-neutral-900 px-4 py-2 text-sm text-white"
          onClick={() => router.replace('/')}
        >
          Go Back
        </button>
      </div>
    );
  }

  if (!connected || !address) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#Fdfdfc] text-neutral-500">
        Connecting wallet...
      </div>
    );
  }

  return <DashboardShell walletAddress={address} onDisconnect={onDisconnect} />;
}
