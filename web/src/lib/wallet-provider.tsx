'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal, WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { WalletAdapterNetwork, WalletReadyState } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { clusterApiUrl } from '@solana/web3.js';

type WalletContextValue = {
  connected: boolean;
  address: string;
  walletName: string;
  walletAvailable: boolean;
  connecting: boolean;
  error: string;
  rpcEndpoint: string;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

function resolveEndpoint() {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(WalletAdapterNetwork.Devnet);
}

function WalletBridge({ children, endpoint }: { children: React.ReactNode; endpoint: string }) {
  const wallet = useWallet();
  const { setVisible, visible } = useWalletModal();
  const [error, setError] = useState('');
  const [pendingConnect, setPendingConnect] = useState(false);

  const walletAvailable = useMemo(
    () =>
      wallet.wallets.some(
        (entry) =>
          entry.readyState === WalletReadyState.Installed ||
          entry.readyState === WalletReadyState.Loadable,
      ),
    [wallet.wallets],
  );

  const connect = useCallback(async () => {
    setError('');
    try {
      if (wallet.connected || wallet.connecting) {
        return;
      }

      if (!wallet.wallet) {
        if (!walletAvailable) {
          setError('No compatible Solana wallet found. Install Phantom or Solflare.');
          return;
        }

        setPendingConnect(true);
        setVisible(true);
        return;
      }

      await wallet.connect();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wallet connection failed');
    }
  }, [wallet, walletAvailable, setVisible]);

  useEffect(() => {
    if (!pendingConnect || !wallet.wallet || wallet.connected || wallet.connecting) {
      return;
    }

    const connectSelectedWallet = async () => {
      try {
        await wallet.connect();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Wallet connection failed');
      } finally {
        setPendingConnect(false);
      }
    };

    void connectSelectedWallet();
  }, [pendingConnect, wallet.wallet, wallet.connected, wallet.connecting, wallet]);

  useEffect(() => {
    if (!visible && pendingConnect && !wallet.wallet) {
      setPendingConnect(false);
    }
  }, [visible, pendingConnect, wallet.wallet]);

  const disconnect = useCallback(async () => {
    setError('');
    try {
      await wallet.disconnect();
    } catch {
      // ignore disconnect edge cases
    }
  }, [wallet]);

  const value = useMemo(
    () => ({
      connected: wallet.connected,
      address: wallet.publicKey?.toBase58() || '',
      walletName: wallet.wallet?.adapter?.name || '',
      walletAvailable,
      connecting: wallet.connecting,
      error,
      rpcEndpoint: endpoint,
      connect,
      disconnect,
    }),
    [wallet.connected, wallet.publicKey, wallet.wallet, walletAvailable, wallet.connecting, error, endpoint, connect, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function WalletProviderClient({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(resolveEndpoint, []);
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          <WalletBridge endpoint={endpoint}>{children}</WalletBridge>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export function useWalletClient() {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error('useWalletClient must be used inside WalletProviderClient');
  }
  return ctx;
}
