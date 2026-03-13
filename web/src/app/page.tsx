'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Coins, SlidersHorizontal, ArrowRight, Wallet, Ban, HandCoins } from 'lucide-react';
import { Header } from '@/components/Header';
import { useWalletClient } from '@/lib/wallet-provider';
import { DEFAULT_PROGRAM_ID_STRING, DEFAULT_TRANSFER_HOOK_PROGRAM_ID_STRING, shortKey } from '@/lib/sss-client';

const capabilityCards = [
  {
    title: 'Preset Deployments',
    description: 'Create SSS-1 and SSS-2 stablecoins from the same SDK with preset or custom configuration.',
    icon: Coins,
  },
  {
    title: 'Treasury Operations',
    description: 'Mint, burn, pause, unpause, freeze, and thaw from one operator console.',
    icon: SlidersHorizontal,
  },
  {
    title: 'Compliance Controls',
    description: 'Blacklist addresses and seize funds through the Token-2022 compliance path.',
    icon: ShieldCheck,
  },
];

const flows = [
  'Initialize a stablecoin from SSS-1, SSS-2, or custom settings.',
  'Manage supply with wallet-signed mint and burn operations.',
  'Apply pause, freeze, blacklist, and seize actions through the SDK.',
  'Inspect config PDAs, mint address, supply, and compliance flags live.',
];

export default function HomePage() {
  const router = useRouter();
  const { connected, address, connect, disconnect, walletAvailable, connecting, error: walletError, rpcEndpoint } = useWalletClient();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && connected) {
      router.push('/dashboard');
    }
  }, [mounted, connected, router]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('active');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' },
    );

    document.querySelectorAll('.reveal').forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <Header
        connected={connected}
        walletAddress={address}
        onConnect={connect}
        onDisconnect={disconnect}
      />

      <main className="mx-auto mt-24 w-full max-w-[1800px] px-4 pb-20 md:px-8">
        {mounted && !walletAvailable && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            No Solana wallet detected. Install Phantom or Solflare to use the operator console.
          </div>
        )}
        {mounted && walletError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {walletError}
          </div>
        )}

        <section className="relative overflow-hidden rounded-[2rem] border border-neutral-200 bg-white px-6 py-10 shadow-sm md:px-10 md:py-14 lg:px-14 lg:py-20">
          <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top_left,_rgba(18,18,18,0.08),_transparent_55%),radial-gradient(circle_at_top_right,_rgba(187,64,0,0.12),_transparent_45%)]" />
          <div className="relative grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div className="reveal active">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-600">
                <Wallet className="h-3.5 w-3.5" />
                Solana Stablecoin Standard
              </div>
              <h1 className="text-5xl font-semibold tracking-tighter text-neutral-950 md:text-7xl lg:text-8xl">
                Operate a Solana stablecoin with the SDK you built.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-600 md:text-xl">
                This example frontend turns the SSS TypeScript SDK into a real operator console for
                SSS-1 and SSS-2 workflows. Connect a wallet, initialize a token, and manage supply
                and compliance from the browser.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  onClick={connect}
                  disabled={connecting}
                  className="group inline-flex items-center gap-3 rounded-full bg-neutral-950 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {connecting ? 'Connecting...' : connected ? 'Open Console' : 'Connect Wallet'}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </button>
                <div className="rounded-full border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
                  RPC: <span className="font-medium text-neutral-900">{rpcEndpoint}</span>
                </div>
              </div>
            </div>

            <div className="reveal delay-100 active rounded-[2rem] border border-neutral-200 bg-[#111111] p-6 text-white shadow-2xl shadow-neutral-950/10 md:p-8">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-neutral-400">
                <span>Frontend Preview</span>
                <span>{connected ? shortKey(address) : 'Wallet Required'}</span>
              </div>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-neutral-400">Program</div>
                  <div className="mt-2 text-sm font-medium break-all">{DEFAULT_PROGRAM_ID_STRING}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-neutral-400">Transfer Hook</div>
                  <div className="mt-2 text-sm font-medium break-all">{DEFAULT_TRANSFER_HOOK_PROGRAM_ID_STRING}</div>
                </div>
              </div>
              <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-50">
                The dashboard uses the same SDK primitives validated in the CLI and test suite.
              </div>
            </div>
          </div>
        </section>

        <section id="standards" className="mt-16 grid gap-6 lg:grid-cols-3">
          {capabilityCards.map(({ title, description, icon: Icon }, index) => (
            <article
              key={title}
              className={`reveal rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm delay-${(index + 1) * 100}`}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-950 text-white">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="mt-6 text-2xl font-semibold tracking-tight text-neutral-950">{title}</h2>
              <p className="mt-3 text-sm leading-7 text-neutral-600">{description}</p>
            </article>
          ))}
        </section>

        <section id="operations" className="mt-16 grid gap-8 rounded-[2rem] border border-neutral-200 bg-white p-8 md:grid-cols-[0.9fr_1.1fr] md:p-12">
          <div className="reveal active">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Operator Workflows
            </div>
            <h2 className="text-4xl font-semibold tracking-tight text-neutral-950 md:text-5xl">
              One console for issue, treasury, and compliance teams.
            </h2>
            <p className="mt-4 max-w-lg text-base leading-8 text-neutral-600">
              This is not a marketing shell. It is an operator-facing example app designed to prove
              the SDK can power a real stablecoin management interface.
            </p>
          </div>
          <div className="grid gap-4">
            {flows.map((flow, index) => {
              const icons = [Coins, SlidersHorizontal, Ban, HandCoins];
              const Icon = icons[index] || ShieldCheck;
              return (
                <div key={flow} className="reveal active flex items-start gap-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
                  <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-neutral-900 shadow-sm">
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-sm leading-7 text-neutral-700">{flow}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section id="docs" className="reveal mt-16 rounded-[2rem] border border-dashed border-neutral-300 bg-[#f8f8f6] p-8 text-sm text-neutral-600 md:p-12">
          <div className="font-semibold uppercase tracking-[0.18em] text-neutral-500">Next Step</div>
          <p className="mt-4 max-w-3xl leading-8">
            Connect a wallet to open the dashboard, then initialize a stablecoin or load an existing
            deployment using the program IDs already configured in the repo.
          </p>
        </section>
      </main>
    </>
  );
}
