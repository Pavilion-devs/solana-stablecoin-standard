'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BN } from '@coral-xyz/anchor';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { PublicKey, Transaction } from '@solana/web3.js';
import {
  Presets,
  Role,
  SolanaStablecoin,
  deriveMinterPda,
  deriveRolePda,
  type StablecoinConfigState,
} from '@stbr/sss-token';
import {
  AlertTriangle,
  Ban,
  Coins,
  HandCoins,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Snowflake,
  Wallet,
} from 'lucide-react';
import {
  DEFAULT_PROGRAM_ID_STRING,
  DEFAULT_RPC_ENDPOINT,
  DEFAULT_TRANSFER_HOOK_PROGRAM_ID_STRING,
  formatUnits,
  parsePublicKey,
  parseUiAmount,
  shortKey,
  useStablecoinProgram,
} from '@/lib/sss-client';

type SectionKey = 'Overview' | 'Initialize' | 'Treasury' | 'Compliance';

type TxItem = {
  label: string;
  signature: string;
};

type ActionResult =
  | string
  | string[]
  | {
      signatures?: string[];
      message?: string;
    }
  | void;

const roleOptions = [
  { value: Role.Burner, label: 'Burner' },
  { value: Role.Pauser, label: 'Pauser' },
  { value: Role.Freezer, label: 'Freezer' },
  { value: Role.Blacklister, label: 'Blacklister' },
  { value: Role.Seizer, label: 'Seizer' },
] as const;

const sections: Array<{ key: SectionKey; icon: typeof LayoutDashboard }> = [
  { key: 'Overview', icon: LayoutDashboard },
  { key: 'Initialize', icon: Wallet },
  { key: 'Treasury', icon: Coins },
  { key: 'Compliance', icon: ShieldCheck },
];

function extractErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error:\s*/, '');
}

function isMissingConfigError(error: unknown) {
  const message = extractErrorMessage(error);
  return (
    message.includes('Account does not exist') ||
    message.includes('No such account') ||
    message.includes('AccountNotInitialized') ||
    message.includes('Failed to fetch')
  );
}

function cardValue(value: string | null | undefined) {
  return value && value.length > 0 ? value : '--';
}

async function ensureTokenAccount(client: SolanaStablecoin, owner: PublicKey) {
  const tokenAccount = client.getTokenAccount(owner);
  const existing = await client.provider.connection.getAccountInfo(tokenAccount, 'confirmed');
  if (existing) {
    return tokenAccount;
  }

  const instruction = createAssociatedTokenAccountIdempotentInstruction(
    client.provider.wallet.publicKey,
    tokenAccount,
    owner,
    client.mintAddress,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const tx = new Transaction().add(instruction);
  await client.provider.sendAndConfirm(tx, []);
  return tokenAccount;
}

async function accountExists(client: SolanaStablecoin, address: PublicKey) {
  const existing = await client.provider.connection.getAccountInfo(address, 'confirmed');
  return Boolean(existing);
}

export function DashboardShell({
  walletAddress,
  onDisconnect,
}: {
  walletAddress: string;
  onDisconnect: () => void | Promise<void>;
}) {
  const program = useStablecoinProgram();
  const [active, setActive] = useState<SectionKey>('Overview');
  const [stablecoin, setStablecoin] = useState<SolanaStablecoin | null>(null);
  const [state, setState] = useState<StablecoinConfigState | null>(null);
  const [supply, setSupply] = useState('0');
  const [loading, setLoading] = useState(true);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const [transactions, setTransactions] = useState<TxItem[]>([]);

  const [initForm, setInitForm] = useState({
    preset: 'sss-2',
    name: 'Pilot USD',
    symbol: 'PUSD',
    decimals: '6',
    uri: '',
    enablePermanentDelegate: true,
    enableTransferHook: true,
    defaultFrozen: true,
    transferHookProgram: DEFAULT_TRANSFER_HOOK_PROGRAM_ID_STRING,
  });
  const [mintForm, setMintForm] = useState({ recipient: walletAddress, amount: '1000' });
  const [burnAmount, setBurnAmount] = useState('100');
  const [freezeOwner, setFreezeOwner] = useState(walletAddress);
  const [blacklistForm, setBlacklistForm] = useState({ address: '', reason: 'Sanctions match' });
  const [removeBlacklistAddress, setRemoveBlacklistAddress] = useState('');
  const [seizeForm, setSeizeForm] = useState({ fromOwner: '', treasuryOwner: walletAddress, amount: '50' });
  const [roleForm, setRoleForm] = useState({
    address: walletAddress,
    minterQuota: '1000000',
    selectedRole: String(Role.Pauser),
  });

  const decimals = state?.decimals ?? Number(initForm.decimals || 6);

  const appendTx = useCallback((label: string, signature: string) => {
    setTransactions((prev) => [{ label, signature }, ...prev].slice(0, 8));
  }, []);

  const refresh = useCallback(async () => {
    if (!program) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const client = await SolanaStablecoin.load(program);
      const [nextState, totalSupply] = await Promise.all([client.getState(), client.getTotalSupply()]);
      setStablecoin(client);
      setState(nextState);
      setSupply(formatUnits(totalSupply, nextState.decimals));
      setIsInitialized(true);
      setError('');
    } catch (err) {
      setStablecoin(null);
      setState(null);
      setSupply('0');
      if (isMissingConfigError(err)) {
        setIsInitialized(false);
        setError('No stablecoin instance has been initialized for this program yet.');
      } else {
        setIsInitialized(false);
        setError(extractErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, [program]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setMintForm((prev) => (prev.recipient === walletAddress ? prev : { ...prev, recipient: walletAddress }));
    setFreezeOwner((prev) => (prev === walletAddress ? prev : walletAddress));
    setSeizeForm((prev) => (prev.treasuryOwner === walletAddress ? prev : { ...prev, treasuryOwner: walletAddress }));
    setRoleForm((prev) => (prev.address === walletAddress ? prev : { ...prev, address: walletAddress }));
  }, [walletAddress]);

  const runAction = useCallback(
    async (label: string, handler: () => Promise<ActionResult>) => {
      setBusyLabel(label);
      setError('');
      setNotice('');
      try {
        const result = await handler();
        if (typeof result === 'string') {
          appendTx(label, result);
          setNotice(`${label} submitted: ${result}`);
        } else if (Array.isArray(result)) {
          result.forEach((signature, index) => appendTx(`${label} ${index + 1}`, signature));
          setNotice(`${label} submitted ${result.length} transaction(s).`);
        } else if (result && typeof result === 'object') {
          const signatures = result.signatures ?? [];
          signatures.forEach((signature, index) =>
            appendTx(signatures.length > 1 ? `${label} ${index + 1}` : label, signature),
          );
          setNotice(
            result.message ??
              (signatures.length > 0 ? `${label} submitted ${signatures.length} transaction(s).` : `${label} completed successfully.`),
          );
        } else {
          setNotice(`${label} completed successfully.`);
        }
        await refresh();
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setBusyLabel(null);
      }
    },
    [appendTx, refresh],
  );

  const handleInitialize = async () => {
    if (!program) {
      setError('Wallet program context is not ready yet.');
      return;
    }

    const parsedDecimals = Number(initForm.decimals);
    if (!Number.isInteger(parsedDecimals) || parsedDecimals < 0 || parsedDecimals > 9) {
      setError('Decimals must be an integer between 0 and 9 for this UI flow.');
      return;
    }

    const isCustom = initForm.preset === 'custom';
    const enablePermanentDelegate = isCustom
      ? initForm.enablePermanentDelegate
      : initForm.preset === 'sss-2';
    const enableTransferHook = isCustom
      ? initForm.enableTransferHook
      : initForm.preset === 'sss-2';
    const defaultAccountFrozen = isCustom
      ? initForm.defaultFrozen
      : initForm.preset === 'sss-2';

    const params = {
      preset:
        initForm.preset === 'sss-1'
          ? Presets.SSS_1
          : initForm.preset === 'sss-2'
            ? Presets.SSS_2
            : Presets.CUSTOM,
      name: initForm.name,
      symbol: initForm.symbol,
      decimals: parsedDecimals,
      uri: initForm.uri,
      enablePermanentDelegate,
      enableTransferHook,
      defaultAccountFrozen,
      transferHookProgram: enableTransferHook
        ? parsePublicKey(initForm.transferHookProgram, 'Transfer hook program')
        : undefined,
    };

    await runAction('Initialize', async () => {
      await SolanaStablecoin.create(program, params);
    });
  };

  const handleMint = async () => {
    if (!stablecoin || !state) {
      setError('Initialize or load the stablecoin first.');
      return;
    }

    await runAction('Mint', async () => {
      const recipient = parsePublicKey(mintForm.recipient, 'Recipient');
      const amount = new BN(parseUiAmount(mintForm.amount, state.decimals).toString());
      const signature = await stablecoin.mint({ recipient, amount });
      const recipientAddress = recipient.toBase58();
      setFreezeOwner(recipientAddress);
      setSeizeForm((prev) => ({ ...prev, fromOwner: prev.fromOwner || recipientAddress }));
      return signature;
    });
  };

  const handleBurn = async () => {
    if (!stablecoin || !state) {
      setError('Initialize or load the stablecoin first.');
      return;
    }

    await runAction('Burn', async () => {
      const amount = new BN(parseUiAmount(burnAmount, state.decimals).toString());
      return stablecoin.burn({ amount });
    });
  };

  const handleFreeze = async () => {
    if (!stablecoin) {
      setError('Initialize or load the stablecoin first.');
      return;
    }

    await runAction('Freeze', async () => {
      const owner = parsePublicKey(freezeOwner, 'Account owner');
      return stablecoin.freezeAccount(owner);
    });
  };

  const handleThaw = async () => {
    if (!stablecoin) {
      setError('Initialize or load the stablecoin first.');
      return;
    }

    await runAction('Thaw', async () => {
      const owner = parsePublicKey(freezeOwner, 'Account owner');
      return stablecoin.thawAccount(owner);
    });
  };

  const handlePause = async () => {
    if (!stablecoin) {
      setError('Initialize or load the stablecoin first.');
      return;
    }

    await runAction('Pause', async () => stablecoin.pause());
  };

  const handleUnpause = async () => {
    if (!stablecoin) {
      setError('Initialize or load the stablecoin first.');
      return;
    }

    await runAction('Unpause', async () => stablecoin.unpause());
  };

  const handleBlacklistAdd = async () => {
    if (!stablecoin) {
      setError('Initialize or load the stablecoin first.');
      return;
    }

    await runAction('Blacklist Add', async () => {
      const address = parsePublicKey(blacklistForm.address, 'Blacklist address');
      return stablecoin.compliance.blacklistAdd(address, blacklistForm.reason);
    });
  };

  const handleBlacklistRemove = async () => {
    if (!stablecoin) {
      setError('Initialize or load the stablecoin first.');
      return;
    }

    await runAction('Blacklist Remove', async () => {
      const address = parsePublicKey(removeBlacklistAddress, 'Blacklist address');
      return stablecoin.compliance.blacklistRemove(address);
    });
  };

  const handleSeize = async () => {
    if (!stablecoin || !state) {
      setError('Initialize or load the stablecoin first.');
      return;
    }

    await runAction('Seize', async () => {
      const fromOwner = parsePublicKey(seizeForm.fromOwner, 'Source owner');
      const treasuryOwner = parsePublicKey(seizeForm.treasuryOwner, 'Treasury owner');
      const amount = new BN(parseUiAmount(seizeForm.amount, state.decimals).toString());
      const fromAccount = stablecoin.getTokenAccount(fromOwner);
      const toAccount = await ensureTokenAccount(stablecoin, treasuryOwner);
      return stablecoin.compliance.seize(fromAccount, toAccount, amount);
    });
  };

  const handleGrantMinter = async () => {
    if (!stablecoin || !state) {
      setError('Initialize or load the stablecoin first.');
      return;
    }

    await runAction('Grant Minter', async () => {
      const member = parsePublicKey(roleForm.address, 'Role member');
      const quota = new BN(parseUiAmount(roleForm.minterQuota, state.decimals).toString());
      const [minterInfo] = deriveMinterPda(stablecoin.getProgramId(), stablecoin.getConfigPda(), member);

      if (await accountExists(stablecoin, minterInfo)) {
        return { message: `Minter already exists for ${shortKey(member.toBase58())}.` };
      }

      const signature = await stablecoin.addMinter(member, quota);
      return {
        signatures: [signature],
        message: `Granted minter quota to ${shortKey(member.toBase58())}.`,
      };
    });
  };

  const handleGrantRole = async () => {
    if (!stablecoin) {
      setError('Initialize or load the stablecoin first.');
      return;
    }

    await runAction('Grant Role', async () => {
      const member = parsePublicKey(roleForm.address, 'Role member');
      const role = Number(roleForm.selectedRole);
      const roleConfig = roleOptions.find((option) => option.value === role);
      if (!roleConfig) {
        throw new Error('Unsupported role selected.');
      }

      const [roleMember] = deriveRolePda(stablecoin.getProgramId(), stablecoin.getConfigPda(), role, member);
      if (await accountExists(stablecoin, roleMember)) {
        return { message: `${roleConfig.label} already exists for ${shortKey(member.toBase58())}.` };
      }

      const signature = await stablecoin.addRole(role, member);
      return {
        signatures: [signature],
        message: `Granted ${roleConfig.label} to ${shortKey(member.toBase58())}.`,
      };
    });
  };

  const handleGrantDemoAccess = async () => {
    if (!stablecoin || !state) {
      setError('Initialize or load the stablecoin first.');
      return;
    }

    await runAction('Grant Demo Access', async () => {
      const member = parsePublicKey(roleForm.address, 'Role member');
      const quota = new BN(parseUiAmount(roleForm.minterQuota, state.decimals).toString());
      const signatures: string[] = [];
      let skipped = 0;

      const [minterInfo] = deriveMinterPda(stablecoin.getProgramId(), stablecoin.getConfigPda(), member);
      if (await accountExists(stablecoin, minterInfo)) {
        skipped += 1;
      } else {
        signatures.push(await stablecoin.addMinter(member, quota));
      }

      for (const roleConfig of roleOptions) {
        const [roleMember] = deriveRolePda(
          stablecoin.getProgramId(),
          stablecoin.getConfigPda(),
          roleConfig.value,
          member,
        );
        if (await accountExists(stablecoin, roleMember)) {
          skipped += 1;
          continue;
        }

        signatures.push(await stablecoin.addRole(roleConfig.value, member));
      }

      return {
        signatures,
        message: `Demo access updated for ${shortKey(member.toBase58())}. Submitted ${signatures.length} transaction(s), skipped ${skipped} existing assignment(s).`,
      };
    });
  };

  const statusCards = useMemo(
    () => [
      { label: 'Program ID', value: DEFAULT_PROGRAM_ID_STRING },
      { label: 'Config PDA', value: stablecoin ? stablecoin.getConfigPda().toBase58() : null },
      { label: 'Mint PDA', value: stablecoin ? stablecoin.getMintPda().toBase58() : null },
      { label: 'Authority', value: state ? state.authority.toBase58() : null },
      { label: 'Supply', value: state ? `${supply} ${state.symbol}` : null },
      { label: 'Paused', value: state ? (state.paused ? 'Yes' : 'No') : null },
      { label: 'Transfer Hook', value: state ? (state.enableTransferHook ? 'Enabled' : 'Disabled') : null },
      { label: 'Permanent Delegate', value: state ? (state.enablePermanentDelegate ? 'Enabled' : 'Disabled') : null },
      { label: 'Default Frozen', value: state ? (state.defaultAccountFrozen ? 'Enabled' : 'Disabled') : null },
    ],
    [stablecoin, state, supply],
  );

  const summaryText = isInitialized
    ? 'The connected wallet can now operate on the configured stablecoin, subject to on-chain roles.'
    : 'Initialize a stablecoin instance first or connect to a network where the configured program already has one.';

  const renderBusy = (label: string) => busyLabel === label;

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Operator Summary</div>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-neutral-950">Stablecoin control room</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-600">{summaryText}</p>
          </div>
          <button
            onClick={() => void refresh()}
            className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 hover:text-neutral-950"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statusCards.map((card) => (
          <div key={card.label} className="rounded-[1.5rem] border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{card.label}</div>
            <div className="mt-3 break-all text-sm font-medium text-neutral-900">{cardValue(card.value)}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Execution Context</div>
          <div className="mt-4 space-y-3 text-sm text-neutral-700">
            <div><span className="font-medium text-neutral-900">Wallet:</span> {walletAddress}</div>
            <div><span className="font-medium text-neutral-900">RPC:</span> {DEFAULT_RPC_ENDPOINT}</div>
            <div><span className="font-medium text-neutral-900">Transfer Hook Program:</span> {DEFAULT_TRANSFER_HOOK_PROGRAM_ID_STRING}</div>
            <div><span className="font-medium text-neutral-900">Compliance Path:</span> Blacklist enforcement + permanent delegate seizure via Token-2022.</div>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Recent Transactions</div>
          <div className="mt-4 space-y-3">
            {transactions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-5 text-sm text-neutral-500">
                No UI-submitted transactions yet.
              </div>
            ) : (
              transactions.map((tx) => (
                <div key={`${tx.label}-${tx.signature}`} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{tx.label}</div>
                  <div className="mt-2 break-all text-sm text-neutral-900">{tx.signature}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderInitialize = () => {
    const isCustom = initForm.preset === 'custom';
    return (
      <div className="space-y-6">
        <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Initialize Stablecoin</div>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-neutral-600">
            Use the SDK create flow from the browser. SSS-1 configures a minimal stablecoin, SSS-2 enables the full compliance stack, and custom mode exposes the extension flags directly.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Preset</label>
            <select
              value={initForm.preset}
              onChange={(event) => setInitForm((prev) => ({ ...prev, preset: event.target.value }))}
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
            >
              <option value="sss-1">SSS-1</option>
              <option value="sss-2">SSS-2</option>
              <option value="custom">Custom</option>
            </select>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-neutral-700">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Name</span>
                <input
                  value={initForm.name}
                  onChange={(event) => setInitForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 outline-none transition focus:border-neutral-900"
                />
              </label>
              <label className="block text-sm text-neutral-700">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Symbol</span>
                <input
                  value={initForm.symbol}
                  onChange={(event) => setInitForm((prev) => ({ ...prev, symbol: event.target.value }))}
                  className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 outline-none transition focus:border-neutral-900"
                />
              </label>
              <label className="block text-sm text-neutral-700">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Decimals</span>
                <input
                  value={initForm.decimals}
                  onChange={(event) => setInitForm((prev) => ({ ...prev, decimals: event.target.value }))}
                  className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 outline-none transition focus:border-neutral-900"
                />
              </label>
              <label className="block text-sm text-neutral-700">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Metadata URI</span>
                <input
                  value={initForm.uri}
                  onChange={(event) => setInitForm((prev) => ({ ...prev, uri: event.target.value }))}
                  className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 outline-none transition focus:border-neutral-900"
                  placeholder="https://..."
                />
              </label>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Compliance Flags</div>
            <div className="mt-5 space-y-4 text-sm text-neutral-700">
              {isCustom ? (
                <>
                  <label className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                    <span>Permanent delegate</span>
                    <input
                      type="checkbox"
                      checked={initForm.enablePermanentDelegate}
                      onChange={(event) => setInitForm((prev) => ({ ...prev, enablePermanentDelegate: event.target.checked }))}
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                    <span>Transfer hook</span>
                    <input
                      type="checkbox"
                      checked={initForm.enableTransferHook}
                      onChange={(event) => setInitForm((prev) => ({ ...prev, enableTransferHook: event.target.checked }))}
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                    <span>Default frozen accounts</span>
                    <input
                      type="checkbox"
                      checked={initForm.defaultFrozen}
                      onChange={(event) => setInitForm((prev) => ({ ...prev, defaultFrozen: event.target.checked }))}
                    />
                  </label>
                </>
              ) : (
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4 leading-7 text-neutral-600">
                  {initForm.preset === 'sss-2'
                    ? 'SSS-2 will enable permanent delegate, transfer hook, and default frozen accounts automatically.'
                    : 'SSS-1 keeps the token minimal and does not enable the compliance extensions.'}
                </div>
              )}

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Transfer Hook Program</span>
                <input
                  value={initForm.transferHookProgram}
                  onChange={(event) => setInitForm((prev) => ({ ...prev, transferHookProgram: event.target.value }))}
                  className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 outline-none transition focus:border-neutral-900"
                  disabled={!(isCustom ? initForm.enableTransferHook : initForm.preset === 'sss-2')}
                />
              </label>

              <button
                onClick={() => void handleInitialize()}
                disabled={Boolean(busyLabel)}
                className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {renderBusy('Initialize') ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                Initialize via SDK
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderTreasury = () => (
    <div className="space-y-6">
      <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Treasury Operations</div>
        <p className="mt-4 text-sm leading-7 text-neutral-600">
          These actions use the SDK directly with the connected wallet. Amount inputs use token units, not raw base units.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3 text-lg font-semibold text-neutral-950">
            <Coins className="h-5 w-5" />
            Mint
          </div>
          <div className="space-y-4">
            <input
              value={mintForm.recipient}
              onChange={(event) => setMintForm((prev) => ({ ...prev, recipient: event.target.value }))}
              placeholder="Recipient wallet"
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
            />
            <input
              value={mintForm.amount}
              onChange={(event) => setMintForm((prev) => ({ ...prev, amount: event.target.value }))}
              placeholder={`Amount (${decimals} decimals)`}
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
            />
            <button
              onClick={() => void handleMint()}
              disabled={Boolean(busyLabel) || !isInitialized}
              className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {renderBusy('Mint') ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
              Mint tokens
            </button>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3 text-lg font-semibold text-neutral-950">
            <HandCoins className="h-5 w-5" />
            Burn
          </div>
          <div className="space-y-4">
            <input
              value={burnAmount}
              onChange={(event) => setBurnAmount(event.target.value)}
              placeholder={`Amount (${decimals} decimals)`}
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
            />
            <button
              onClick={() => void handleBurn()}
              disabled={Boolean(busyLabel) || !isInitialized}
              className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {renderBusy('Burn') ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <HandCoins className="h-4 w-4" />}
              Burn tokens
            </button>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3 text-lg font-semibold text-neutral-950">
            <PauseCircle className="h-5 w-5" />
            Pause Control
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => void handlePause()}
              disabled={Boolean(busyLabel) || !isInitialized}
              className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {renderBusy('Pause') ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />}
              Pause
            </button>
            <button
              onClick={() => void handleUnpause()}
              disabled={Boolean(busyLabel) || !isInitialized}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-5 py-3 text-sm font-semibold text-neutral-800 transition hover:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {renderBusy('Unpause') ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
              Unpause
            </button>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3 text-lg font-semibold text-neutral-950">
            <Snowflake className="h-5 w-5" />
            Freeze / Thaw
          </div>
          <p className="mb-4 text-sm leading-7 text-neutral-600">
            Enter the wallet owner, not the token account address. On SSS-2, a fresh recipient ATA starts frozen by default, so the usual flow is mint to a wallet, then thaw that same wallet once.
          </p>
          <div className="space-y-4">
            <input
              value={freezeOwner}
              onChange={(event) => setFreezeOwner(event.target.value)}
              placeholder="Owner wallet"
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
            />
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => void handleFreeze()}
                disabled={Boolean(busyLabel) || !isInitialized}
                className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {renderBusy('Freeze') ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Snowflake className="h-4 w-4" />}
                Freeze
              </button>
              <button
                onClick={() => void handleThaw()}
                disabled={Boolean(busyLabel) || !isInitialized}
                className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-5 py-3 text-sm font-semibold text-neutral-800 transition hover:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {renderBusy('Thaw') ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                Thaw
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderCompliance = () => (
    <div className="space-y-6">
      <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Compliance Actions</div>
        <p className="mt-4 text-sm leading-7 text-neutral-600">
          These controls are meaningful when the connected wallet holds the SSS-2 compliance roles on-chain.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm xl:col-span-2">
          <div className="mb-4 flex items-center gap-3 text-lg font-semibold text-neutral-950">
            <ShieldCheck className="h-5 w-5" />
            Role Management
          </div>
          <p className="max-w-3xl text-sm leading-7 text-neutral-600">
            Use this panel to assign operator roles from the connected authority wallet. For a submission demo, grant the current wallet demo access first, then mint and compliance actions from the same browser session.
          </p>
          <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr_0.8fr]">
            <input
              value={roleForm.address}
              onChange={(event) => setRoleForm((prev) => ({ ...prev, address: event.target.value }))}
              placeholder="Wallet to authorize"
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
            />
            <input
              value={roleForm.minterQuota}
              onChange={(event) => setRoleForm((prev) => ({ ...prev, minterQuota: event.target.value }))}
              placeholder={`Minter quota (${decimals} decimals)`}
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
            />
            <button
              type="button"
              onClick={() => setRoleForm((prev) => ({ ...prev, address: walletAddress }))}
              className="inline-flex items-center justify-center rounded-full border border-neutral-300 px-5 py-3 text-sm font-semibold text-neutral-800 transition hover:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Use connected wallet
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={() => void handleGrantDemoAccess()}
              disabled={Boolean(busyLabel) || !isInitialized}
              className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {renderBusy('Grant Demo Access') ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Grant full demo access
            </button>
            <button
              onClick={() => void handleGrantMinter()}
              disabled={Boolean(busyLabel) || !isInitialized}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-5 py-3 text-sm font-semibold text-neutral-800 transition hover:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {renderBusy('Grant Minter') ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
              Grant minter
            </button>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_auto]">
            <select
              value={roleForm.selectedRole}
              onChange={(event) => setRoleForm((prev) => ({ ...prev, selectedRole: event.target.value }))}
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
            >
              {roleOptions.map((roleOption) => (
                <option key={roleOption.value} value={roleOption.value}>
                  {roleOption.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => void handleGrantRole()}
              disabled={Boolean(busyLabel) || !isInitialized}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-5 py-3 text-sm font-semibold text-neutral-800 transition hover:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {renderBusy('Grant Role') ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Grant selected role
            </button>
          </div>

          <div className="mt-5 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-4 text-sm leading-7 text-neutral-600">
            Re-running this panel is safe. Existing role and minter PDAs are detected first, so the UI skips assignments that already exist.
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3 text-lg font-semibold text-neutral-950">
            <Ban className="h-5 w-5" />
            Blacklist Add
          </div>
          <div className="space-y-4">
            <input
              value={blacklistForm.address}
              onChange={(event) => setBlacklistForm((prev) => ({ ...prev, address: event.target.value }))}
              placeholder="Wallet address"
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
            />
            <input
              value={blacklistForm.reason}
              onChange={(event) => setBlacklistForm((prev) => ({ ...prev, reason: event.target.value }))}
              placeholder="Reason"
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
            />
            <button
              onClick={() => void handleBlacklistAdd()}
              disabled={Boolean(busyLabel) || !isInitialized}
              className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {renderBusy('Blacklist Add') ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Add to blacklist
            </button>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3 text-lg font-semibold text-neutral-950">
            <ShieldCheck className="h-5 w-5" />
            Blacklist Remove
          </div>
          <div className="space-y-4">
            <input
              value={removeBlacklistAddress}
              onChange={(event) => setRemoveBlacklistAddress(event.target.value)}
              placeholder="Wallet address"
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
            />
            <button
              onClick={() => void handleBlacklistRemove()}
              disabled={Boolean(busyLabel) || !isInitialized}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-5 py-3 text-sm font-semibold text-neutral-800 transition hover:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {renderBusy('Blacklist Remove') ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Remove from blacklist
            </button>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm xl:col-span-2">
          <div className="mb-4 flex items-center gap-3 text-lg font-semibold text-neutral-950">
            <AlertTriangle className="h-5 w-5" />
            Seize
          </div>
          <p className="mb-4 max-w-3xl text-sm leading-7 text-neutral-600">
            The UI accepts owner wallets for the source and treasury. It derives the Token-2022 accounts underneath, ensures the treasury ATA exists, and then calls the SDK seizure path.
          </p>
          <div className="grid gap-4 xl:grid-cols-3">
            <input
              value={seizeForm.fromOwner}
              onChange={(event) => setSeizeForm((prev) => ({ ...prev, fromOwner: event.target.value }))}
              placeholder="Source owner"
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
            />
            <input
              value={seizeForm.treasuryOwner}
              onChange={(event) => setSeizeForm((prev) => ({ ...prev, treasuryOwner: event.target.value }))}
              placeholder="Treasury owner"
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
            />
            <input
              value={seizeForm.amount}
              onChange={(event) => setSeizeForm((prev) => ({ ...prev, amount: event.target.value }))}
              placeholder={`Amount (${decimals} decimals)`}
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
            />
          </div>
          <button
            onClick={() => void handleSeize()}
            disabled={Boolean(busyLabel) || !isInitialized}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-neutral-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {renderBusy('Seize') ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
            Seize funds
          </button>
        </div>
      </div>
    </div>
  );

  const activeContent =
    active === 'Overview'
      ? renderOverview()
      : active === 'Initialize'
        ? renderInitialize()
        : active === 'Treasury'
          ? renderTreasury()
          : renderCompliance();

  return (
    <div className="flex h-screen overflow-hidden bg-[#Fdfdfc]">
      <aside className="hidden w-72 shrink-0 border-r border-neutral-200 bg-white xl:flex xl:flex-col xl:justify-between">
        <div>
          <div className="border-b border-neutral-100 px-6 py-6">
            <Link href="/" className="text-xl font-semibold tracking-tight transition-opacity hover:opacity-70">
              SSS.
            </Link>
            <p className="mt-3 text-sm leading-6 text-neutral-500">Frontend example for the Solana Stablecoin Standard SDK.</p>
          </div>

          <nav className="space-y-1 px-3 py-4">
            {sections.map(({ key, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActive(key)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  active === key
                    ? 'bg-neutral-900 text-white shadow-sm'
                    : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {key}
              </button>
            ))}
          </nav>
        </div>

        <div className="space-y-1 px-3 pb-4">
          <div className="mb-2 border-t border-neutral-100 px-3 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Connected Wallet</div>
            <div className="mt-2 text-sm font-medium text-neutral-900">{shortKey(walletAddress)}</div>
          </div>
          <button
            onClick={() => void onDisconnect()}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-neutral-500 transition-all duration-200 hover:bg-neutral-50 hover:text-neutral-900"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Disconnect
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="border-b border-neutral-200 bg-white/90 px-4 py-4 backdrop-blur-md md:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Operator Console</div>
              <div className="mt-1 text-lg font-semibold text-neutral-950">{active}</div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-600">
              <div className="rounded-full border border-neutral-200 px-4 py-2">Wallet: {shortKey(walletAddress)}</div>
              <button
                onClick={() => void refresh()}
                className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-4 py-2 transition hover:border-neutral-900 hover:text-neutral-950"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
          {error && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {error}
            </div>
          )}
          {notice && (
            <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
              {notice}
            </div>
          )}
          {loading ? (
            <div className="flex h-[60vh] items-center justify-center rounded-[2rem] border border-neutral-200 bg-white text-neutral-500 shadow-sm">
              <LoaderCircle className="mr-3 h-5 w-5 animate-spin" />
              Loading stablecoin state...
            </div>
          ) : (
            activeContent
          )}
        </main>
      </div>
    </div>
  );
}
