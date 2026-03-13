'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export function Header({
  connected,
  walletAddress,
  onConnect,
  onDisconnect,
}: {
  connected: boolean;
  walletAddress?: string;
  onConnect: () => void | Promise<void>;
  onDisconnect: () => void | Promise<void>;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 mx-auto flex w-full max-w-[1800px] items-center justify-between border-b px-6 py-4 backdrop-blur-md transition-all duration-300 md:px-12 md:py-6 ${
        scrolled ? 'border-neutral-100 bg-[#Fdfdfc]/90 shadow-sm' : 'border-transparent bg-[#Fdfdfc]/80'
      }`}
    >
      <Link href="/" className="cursor-pointer text-xl font-semibold tracking-tight transition-opacity hover:opacity-70">
        SSS.
      </Link>

      <div className="hidden gap-8 text-sm font-medium text-neutral-600 md:flex">
        <Link href="#standards" className="transition-colors hover:text-black">Standards</Link>
        <Link href="#operations" className="transition-colors hover:text-black">Operations</Link>
        <Link href="#docs" className="transition-colors hover:text-black">Docs</Link>
      </div>

      <button
        className="rounded-full bg-neutral-900 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-neutral-200/50 transition-all duration-300 hover:scale-105 hover:bg-neutral-700"
        onClick={connected ? onDisconnect : onConnect}
      >
        {connected ? `${walletAddress?.slice(0, 4)}...${walletAddress?.slice(-4)}` : 'Connect Wallet'}
      </button>
    </nav>
  );
}
