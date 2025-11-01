import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TransactionBlock } from '@mysten/sui.js';
import '@wallet-standard/core';
import { getWallets } from '@mysten/wallet-standard';
import { keccak_256 } from '@noble/hashes/sha3';
import './styles.css';

type WalletAccount = { address: string };
type WalletStandardAccount = { address: string; [key: string]: unknown };
type AnyWallet = {
  requestPermissions?: () => Promise<void>;
  getAccounts?: () => Promise<WalletAccount[] | string[]>;
  accounts?: Array<WalletAccount | WalletStandardAccount | string>;
  connect?: () => Promise<any>;
  signAndExecuteTransactionBlock?: (input: any) => Promise<any>;
  signAndExecuteTransaction?: (input: any) => Promise<any>;
  features?: Record<string, any>;
  name?: string;
  [key: string]: unknown;
};

declare global {
  interface Window {
    suiWallet?: AnyWallet;
    suiet?: AnyWallet & { wallet?: AnyWallet; adapter?: AnyWallet };
    suietWallet?: AnyWallet;
    ethos?: { wallet?: AnyWallet };
    martian?: AnyWallet & { sui?: AnyWallet };
    onekey?: { sui?: AnyWallet };
    wallet?: AnyWallet;
    sui?: AnyWallet;
    walletStandard?: {
      wallets?: any;
      get?: () => { wallets?: any } | any;
      subscribe?: (callback: (event: { wallets?: any }) => void) => () => void;
    };
    wallets?: any;
    __wallets__?: any;
  }
}

type WalletInfo = { wallet: AnyWallet; name?: string; connected?: boolean };

const isSuiWallet = (candidate: any): candidate is AnyWallet => {
  if (!candidate) return false;
  const hasDirectApi =
    typeof candidate.signAndExecuteTransactionBlock === 'function' ||
    typeof candidate.signAndExecuteTransaction === 'function';
  const featureBlock = candidate.features?.['sui:signAndExecuteTransactionBlock'];
  const featureLegacy = candidate.features?.['sui:signAndExecuteTransaction'];
  const featureConnect = candidate.features?.['standard:connect'];
  const hasFeatureApi =
    typeof featureBlock?.signAndExecuteTransactionBlock === 'function' ||
    typeof featureLegacy?.signAndExecuteTransaction === 'function';
  const hasConnect = typeof featureConnect?.connect === 'function';
  return hasDirectApi || hasFeatureApi || hasConnect || typeof candidate.connect === 'function';
};

const getStandardConnect = (wallet: AnyWallet): (() => Promise<any>) | undefined => {
  const feature = wallet.features?.['standard:connect'] as { connect?: () => Promise<any> } | undefined;
  if (typeof feature?.connect === 'function') return feature.connect.bind(feature);
  if (typeof wallet.connect === 'function') return wallet.connect.bind(wallet);
  return undefined;
};

const getStandardSignTxBlock = (wallet: AnyWallet): ((args: any) => Promise<any>) | undefined => {
  const feature = wallet.features?.['sui:signAndExecuteTransactionBlock'] as {
    signAndExecuteTransactionBlock?: (args: any) => Promise<any>;
  } | undefined;
  if (typeof feature?.signAndExecuteTransactionBlock === 'function') {
    return feature.signAndExecuteTransactionBlock.bind(feature);
  }
  return undefined;
};

const getStandardSignTxLegacy = (wallet: AnyWallet): ((args: any) => Promise<any>) | undefined => {
  const feature = wallet.features?.['sui:signAndExecuteTransaction'] as {
    signAndExecuteTransaction?: (args: any) => Promise<any>;
  } | undefined;
  if (typeof feature?.signAndExecuteTransaction === 'function') {
    return feature.signAndExecuteTransaction.bind(feature);
  }
  return undefined;
};

const bestAccount = async (wallet: AnyWallet): Promise<string | null> => {
  const directAccounts = wallet.accounts && wallet.accounts.length ? wallet.accounts : undefined;
  const fromFeature = wallet.features?.['standard:getAccount'] as { getAccount?: () => Promise<any> } | undefined;
  if (directAccounts) {
    const first = directAccounts[0];
    if (!first) return null;
    if (typeof first === 'string') return first;
    return (first as WalletAccount).address ?? (first as WalletStandardAccount).address ?? null;
  }
  if (typeof wallet.getAccounts === 'function') {
    try {
      const accounts = await wallet.getAccounts();
      const first = accounts?.[0];
      if (!first) return null;
      return typeof first === 'string'
        ? first
        : (first as WalletAccount).address ?? (first as WalletStandardAccount).address ?? null;
    } catch (error) {
      console.warn('wallet.getAccounts failed in bestAccount', error);
    }
  }
  if (fromFeature?.getAccount) {
    try {
      const result = await fromFeature.getAccount();
      const address = result?.address ?? result?.data?.address;
      if (address) return address;
    } catch (error) {
      console.warn('wallet standard getAccount failed', error);
    }
  }
  return null;
};

const toArray = (collection: any): any[] => {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (typeof collection.values === 'function') {
    try {
      return Array.from(collection.values());
    } catch (error) {
      console.warn('wallet detection: failed to enumerate values()', error);
    }
  }
  if (typeof collection[Symbol.iterator] === 'function') {
    try {
      return Array.from(collection as Iterable<any>);
    } catch (error) {
      console.warn('wallet detection: failed to iterate collection', error);
    }
  }
  return [];
};

const extractWalletInfo = (entry: any): WalletInfo | null => {
  if (!entry) return null;
  const entryAny = entry as any;
  const raw = entryAny.wallet ?? entryAny.adapter ?? entryAny;
  if (!isSuiWallet(raw)) return null;
  const name = entryAny.name ?? raw?.name ?? 'Wallet Standard provider';
  return { wallet: raw, name };
};

const findWalletInCollection = (collection: any): WalletInfo | null => {
  for (const item of toArray(collection)) {
    const info = extractWalletInfo(item);
    if (info) return info;
  }
  return null;
};

const scanWindowForWallet = (): WalletInfo | null => {
  const w = window as any;
  let names: string[] = [];
  try {
    names = Object.getOwnPropertyNames(w);
  } catch (error) {
    console.warn('wallet detection: unable to enumerate window properties', error);
    return null;
  }
  for (const key of names) {
    if (!key) continue;
    const lower = key.toLowerCase();
    if (!lower.includes('wallet') && !lower.includes('sui') && !lower.includes('ethos') && !lower.includes('martian')) {
      continue;
    }
    let candidate: any;
    try {
      candidate = w[key];
    } catch (_error) {
      continue;
    }
    if (isSuiWallet(candidate)) {
      devLog('window scan detected wallet', key);
      return { wallet: candidate, name: key };
    }
    const nested = candidate?.wallet ?? candidate?.adapter ?? candidate?.provider;
    if (isSuiWallet(nested)) {
      devLog('window scan detected nested wallet', `${key}.wallet`);
      return { wallet: nested, name: key };
    }
  }
  return null;
};

const FULLNODE = 'https://fullnode.testnet.sui.io';
const PACKAGE_ID = '0x78da54752b8cca732c97602c9488ebf54e106b926682530b34e8e0c7a3c3d103';
const MODULE = 'rps_commit_reveal';
const CLOCK_ID = '0x6';

const names = ['Rock', 'Paper', 'Scissors'];
const devLog = (...args: unknown[]) => {
  if (import.meta.env.DEV) {
    console.debug('[rps-wallet]', ...args);
  }
};

const App: React.FC = () => {
  const walletRegistry = useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      const registry = getWallets();
      devLog('walletStandard registry ready');
      return registry;
    } catch (error) {
      console.warn('walletStandard registry init failed', error);
      return null;
    }
  }, []);

  const [gameId, setGameId] = useState('');
  const [move, setMove] = useState('0');
  const [secret, setSecret] = useState('');
  const [status, setStatus] = useState('Ready');
  const [result, setResult] = useState('');
  const [walletLabel, setWalletLabel] = useState('');
  const walletInfoRef = useRef<WalletInfo | null>(null);

  const applyWalletInfo = useCallback(
    (info: WalletInfo | null) => {
      if (!info) return false;
      const existingConnected = walletInfoRef.current?.connected ?? false;
      const merged: WalletInfo = {
        wallet: info.wallet,
        name: info.name ?? walletInfoRef.current?.name ?? 'Sui wallet',
        connected: info.connected ?? existingConnected,
      };
      walletInfoRef.current = merged;
      setWalletLabel(merged.name ?? 'Sui wallet');
      setStatus((prev) =>
        prev.startsWith('No Sui wallet') || prev.startsWith('Waiting for wallet')
          ? `Wallet detected: ${merged.name ?? 'Sui provider'}.`
          : prev
      );
      return true;
    },
    []
  );

  const commitBytes = useCallback((moveValue: number, secretValue: string) => {
    const encoder = new TextEncoder();
    const secretBytes = encoder.encode(secretValue);
    const data = new Uint8Array(1 + secretBytes.length);
    data[0] = moveValue & 0xff;
    data.set(secretBytes, 1);
    return Array.from(keccak_256(data));
  }, []);

  const getWalletInfo = useCallback((): WalletInfo | null => {
    const w = window as any;
    const directCandidates: Array<[string, AnyWallet | undefined]> = [
      ['Sui Wallet', w.suiWallet],
      ['Sui Wallet (legacy)', w.sui],
      ['Suiet', w.suiet],
      ['Suiet Wallet', w.suietWallet],
      ['Suiet (nested)', w.suiet?.wallet],
      ['Suiet (adapter)', w.suiet?.adapter],
      ['Ethos', w.ethos?.wallet],
      ['Martian', w.martian?.sui ?? w.martian],
      ['OneKey', w.onekey?.sui],
      ['Generic wallet', w.wallet],
    ];

    for (const [name, candidate] of directCandidates) {
      if (isSuiWallet(candidate)) {
        devLog('direct wallet detected', name);
        return { wallet: candidate, name };
      }
    }

  const standardHost = w.walletStandard ?? w.wallets ?? w.__wallets__;
    const standardResult = standardHost?.get?.();
    devLog('walletStandard host', !!standardHost, standardResult);
    const sources = [
      standardHost?.wallets,
      standardResult?.wallets,
      standardResult,
      standardHost,
      w.wallets,
      w.__wallets__,
    ];

    for (const source of sources) {
      const found = findWalletInCollection(source);
      if (found) {
        devLog('walletStandard provider detected', found.name);
        return found;
      }
    }

    const scanned = scanWindowForWallet();
    if (scanned) return scanned;

    const registryWallets = walletRegistry?.get?.() ?? [];
    if (registryWallets.length) {
      devLog('walletStandard registry wallets', registryWallets.length);
      for (const registryWallet of registryWallets) {
        if (isSuiWallet(registryWallet)) {
          const info = extractWalletInfo(registryWallet);
          if (info) {
            return info;
          }
          return { wallet: registryWallet as AnyWallet, name: registryWallet.name };
        }
      }
    }

    return null;
  }, [walletRegistry]);

  const getWallet = useCallback((): AnyWallet | undefined => {
    if (!walletInfoRef.current) {
      const info = getWalletInfo();
      applyWalletInfo(info);
    }
    return walletInfoRef.current?.wallet;
  }, [applyWalletInfo, getWalletInfo]);

  const waitForWallet = useCallback(
    async (timeoutMs = 5000, stepMs = 200): Promise<AnyWallet | undefined> => {
      const start = Date.now();
      let detected = getWallet();
      devLog('waiting for wallet, initial', !!detected);
      if (detected) return detected;
      return new Promise((resolve) => {
        const timer = window.setInterval(() => {
          detected = getWallet();
          if (detected || Date.now() - start >= timeoutMs) {
            devLog('waitForWallet resolved', !!detected, 'elapsed', Date.now() - start);
            window.clearInterval(timer);
            resolve(detected);
          }
        }, stepMs);
      });
    },
    [getWallet]
  );

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const detect = () => {
      if (cancelled) return true;
      const info = getWalletInfo();
      if (applyWalletInfo(info)) {
        return true;
      }
      if (attempts === 0) {
        setStatus((prev) =>
          prev === 'Ready' || prev === 'Awaiting wallet injection...'
            ? 'Waiting for wallet extension...'
            : prev
        );
        devLog('wallet detection pending');
      }
      return false;
    };

    if (detect()) {
      return () => {
        cancelled = true;
      };
    }

    const timer = window.setInterval(() => {
      attempts += 1;
      if (detect() || attempts > 60) {
        window.clearInterval(timer);
      }
    }, 1000);

    const standardHost = (window as any).walletStandard ?? (window as any).wallets ?? (window as any).__wallets__;
    const unsubscribe = typeof standardHost?.subscribe === 'function'
      ? standardHost.subscribe((event: { wallets?: any }) => {
          const info = findWalletInCollection(event?.wallets);
          if (info) {
            applyWalletInfo(info);
          }
        })
      : undefined;

    const onWalletEvent = () => {
      const info = getWalletInfo();
      if (info) {
        applyWalletInfo(info);
      }
    };

    const walletEvents = [
      'wallet-standard:wallets',
      'wallet-standard:registered',
      'wallet-standard:app-ready',
      'wallet-standard:changed',
      'sui_wallet_ready',
      'sui-wallet-ready',
      'SuietWalletLoaded',
      'suiet:ready',
      'suiet:connected',
    ];

    walletEvents.forEach((eventName) => {
      window.addEventListener(eventName, onWalletEvent as EventListener);
    });

    const offRegister = walletRegistry?.on?.('register', (...wallets: AnyWallet[]) => {
      devLog('walletStandard registry register event', wallets.map((w) => w.name));
      for (const registered of wallets) {
        if (applyWalletInfo({ wallet: registered, name: registered?.name })) {
          break;
        }
      }
    });

    const offUnregister = walletRegistry?.on?.('unregister', () => {
      devLog('walletStandard registry unregister event');
    });

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      unsubscribe?.();
      offRegister?.();
      offUnregister?.();
      walletEvents.forEach((eventName) => {
        window.removeEventListener(eventName, onWalletEvent as EventListener);
      });
    };
  }, [applyWalletInfo, getWalletInfo, walletRegistry]);

  const ensureWallet = useCallback(async (): Promise<AnyWallet | null> => {
    let wallet = getWallet();
    if (!wallet) {
      setStatus('Awaiting wallet injection...');
      wallet = (await waitForWallet(7000, 200)) ?? undefined;
    }
    if (!wallet) {
      setStatus('No Sui wallet detected. Install Sui Wallet, Suiet, or another provider and reload.');
      return null;
    }
    try {
      if (typeof wallet.requestPermissions === 'function') {
        await wallet.requestPermissions();
      }

      const connectFn = getStandardConnect(wallet);
      if (connectFn && !walletInfoRef.current?.connected) {
        try {
          const result = await connectFn();
          const accounts = result?.accounts ?? result?.account ? [result.account] : undefined;
          if (Array.isArray(accounts) && accounts.length) {
            wallet.accounts = accounts;
          }
          applyWalletInfo({ wallet, name: walletLabel || wallet.name, connected: true });
        } catch (error) {
          console.warn('wallet standard connect failed', error);
        }
      } else {
        applyWalletInfo({ wallet, name: walletLabel || wallet.name, connected: true });
      }
    } catch (error) {
      console.warn('wallet connection failed', error);
    }
    return wallet;
  }, [applyWalletInfo, getWallet, waitForWallet, walletLabel]);

  const myAddress = useCallback(async (): Promise<string | null> => {
    const wallet = await ensureWallet();
    if (!wallet) return null;
    try {
      const address = await bestAccount(wallet);
      if (!address) {
        setStatus('Wallet returned no address.');
        return null;
      }
      return address;
    } catch (error) {
      console.error('wallet.getAccounts failed', error);
      setStatus('Unable to read wallet address. Check wallet permissions.');
      return null;
    }
  }, [ensureWallet]);

  const sendMoveCall = useCallback(
    async (
      moveFn: string,
      argKinds: Array<'object' | 'pure'>,
      argValues: any[],
      gasBudget = 5_000_000
    ) => {
      const wallet = await ensureWallet();
      if (!wallet) throw new Error('No Sui wallet available');

      const accountCandidates = wallet.accounts && wallet.accounts.length ? wallet.accounts : undefined;
      const firstCandidate = accountCandidates?.[0];
      let accountValue: any = firstCandidate;
      if (!accountValue || (typeof accountValue === 'string' && !accountValue)) {
        try {
          const fetched = await wallet.getAccounts?.();
          if (fetched && fetched.length) {
            accountValue = fetched[0];
            wallet.accounts = fetched as AnyWallet['accounts'];
          }
        } catch (error) {
          console.warn('wallet.getAccounts in sendMoveCall failed', error);
        }
      }

      const accountAddress = typeof accountValue === 'string'
        ? accountValue
        : (accountValue as WalletAccount | WalletStandardAccount | undefined)?.address;

      if (typeof wallet.signAndExecuteTransactionBlock === 'function') {
        const tx = new TransactionBlock();
        const args = argValues.map((value, index) =>
          argKinds[index] === 'object' ? tx.object(value) : tx.pure(value)
        );
        tx.moveCall({ target: `${PACKAGE_ID}::${MODULE}::${moveFn}`, arguments: args });
        return wallet.signAndExecuteTransactionBlock({
          transactionBlock: tx,
          options: { showEffects: true, showObjectChanges: true },
        });
      }

      if (typeof wallet.signAndExecuteTransaction === 'function') {
        const tx = {
          kind: 'moveCall',
          data: {
            packageObjectId: PACKAGE_ID,
            module: MODULE,
            function: moveFn,
            typeArguments: [],
            arguments: argValues,
            gasBudget,
          },
        };
        return wallet.signAndExecuteTransaction(tx);
      }

      const standardExecuteBlock = getStandardSignTxBlock(wallet);
      if (standardExecuteBlock) {
        const tx = new TransactionBlock();
        const args = argValues.map((value, index) =>
          argKinds[index] === 'object' ? tx.object(value) : tx.pure(value)
        );
        tx.moveCall({ target: `${PACKAGE_ID}::${MODULE}::${moveFn}`, arguments: args });
        const account =
          typeof accountValue === 'string'
            ? { address: accountValue }
            : accountValue ?? (accountAddress ? { address: accountAddress } : undefined);
        if (!account) {
          throw new Error('Wallet did not return an account for signing.');
        }
        return standardExecuteBlock({
          transactionBlock: tx,
          account,
          options: { showEffects: true, showObjectChanges: true },
        });
      }

      const standardExecuteLegacy = getStandardSignTxLegacy(wallet);
      if (standardExecuteLegacy) {
        const tx = {
          kind: 'moveCall',
          data: {
            packageObjectId: PACKAGE_ID,
            module: MODULE,
            function: moveFn,
            typeArguments: [],
            arguments: argValues,
            gasBudget,
          },
        };
        return standardExecuteLegacy({ transaction: tx });
      }

      throw new Error('Wallet does not support known Sui APIs.');
    },
    [ensureWallet]
  );

  const rpc = useCallback(async (method: string, params: unknown[]) => {
    const response = await fetch(FULLNODE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const json = await response.json();
    if (json.error) throw new Error(json.error.message || 'RPC error');
    return json.result;
  }, []);

  const objectChangesFrom = useCallback((res: any) => {
    if (!res) return [] as any[];
    return (
      res.objectChanges ||
      res.effects?.objectChanges ||
      res.effects?.created ||
      []
    );
  }, []);

  const handleCreate = useCallback(async () => {
    try {
      setStatus('Creating game...');
      setResult('');
      const res = await sendMoveCall(
        'create_game',
        ['pure', 'object'],
        [60_000, CLOCK_ID],
        10_000_000
      );
      const changes = objectChangesFrom(res);
      let newGameId = '';
      for (const change of changes) {
        if (
          change?.type === 'created' &&
          typeof change.objectType === 'string' &&
          change.objectType.endsWith(`::${MODULE}::Game`)
        ) {
          newGameId = change.objectId;
          break;
        }
      }
      if (newGameId) {
        setGameId(newGameId);
        setStatus(`Created game: ${newGameId}`);
      } else {
        setStatus('Game created. Copy the object ID from wallet activity.');
      }
    } catch (error: any) {
      console.error(error);
      setStatus(`Create failed: ${error?.message ?? error}`);
    }
  }, [objectChangesFrom, sendMoveCall]);

  const handleJoin = useCallback(async () => {
    if (!gameId) {
      setStatus('Enter Game Object ID');
      return;
    }
    try {
      setStatus('Joining game...');
      setResult('');
      const addr = await myAddress();
      if (!addr) return;
      await sendMoveCall('join_game', ['object', 'pure', 'object'], [gameId, addr, CLOCK_ID]);
      setStatus('Joined. Commit your move next.');
    } catch (error: any) {
      console.error(error);
      setStatus(`Join failed: ${error?.message ?? error}`);
    }
  }, [gameId, myAddress, sendMoveCall]);

  const handleCommit = useCallback(async () => {
    if (!gameId) {
      setStatus('Enter Game Object ID');
      return;
    }
    if (!secret) {
      setStatus('Enter a secret');
      return;
    }
    try {
      setStatus('Committing move...');
      setResult('');
      const addr = await myAddress();
      if (!addr) return;
      const commitment = commitBytes(Number(move), secret);
      await sendMoveCall('commit_move', ['object', 'pure', 'pure'], [gameId, addr, commitment]);
      setStatus('Committed. Reveal after your opponent commits.');
    } catch (error: any) {
      console.error(error);
      setStatus(`Commit failed: ${error?.message ?? error}`);
    }
  }, [commitBytes, gameId, move, myAddress, secret, sendMoveCall]);

  const handleReveal = useCallback(async () => {
    if (!gameId) {
      setStatus('Enter Game Object ID');
      return;
    }
    if (!secret) {
      setStatus('Enter a secret');
      return;
    }
    try {
      setStatus('Revealing move...');
      const addr = await myAddress();
      if (!addr) return;
      const secretBytes = Array.from(new TextEncoder().encode(secret));
      await sendMoveCall(
        'reveal_move',
        ['object', 'pure', 'pure', 'pure'],
        [gameId, addr, Number(move), secretBytes]
      );
      setStatus('Reveal submitted.');
    } catch (error: any) {
      console.error(error);
      setStatus(`Reveal failed: ${error?.message ?? error}`);
    }
  }, [gameId, move, myAddress, secret, sendMoveCall]);

  const handleClaim = useCallback(async () => {
    if (!gameId) {
      setStatus('Enter Game Object ID');
      return;
    }
    try {
      setStatus('Submitting timeout claim...');
      const addr = await myAddress();
      if (!addr) return;
      await sendMoveCall('claim_timeout', ['object', 'object', 'pure'], [gameId, CLOCK_ID, addr]);
      setStatus('Timeout claim submitted (if eligible).');
    } catch (error: any) {
      console.error(error);
      setStatus(`Claim failed: ${error?.message ?? error}`);
    }
  }, [gameId, myAddress, sendMoveCall]);

  const handleCheck = useCallback(async () => {
    if (!gameId) {
      setStatus('Enter Game Object ID');
      return;
    }
    try {
      setStatus('Fetching winner...');
      const object: any = await rpc('sui_getObject', [{ id: gameId, options: { showContent: true } }]);
      const fields = object?.data?.content?.fields ?? {};
      const winner = fields.winner;
      if (winner && winner !== '0x0') {
        setResult(`Winner: ${winner}`);
      } else {
        setResult('Draw or still pending...');
      }
      setStatus('Done.');
    } catch (error: any) {
      console.error(error);
      setStatus(`Fetch failed: ${error?.message ?? error}`);
    }
  }, [gameId, rpc]);

  const handleDemo = useCallback(() => {
    const playerMove = Number(move);
    const botMove = Math.floor(Math.random() * 3);
    const outcome =
      playerMove === botMove
        ? 0
        : (playerMove === 0 && botMove === 2) ||
          (playerMove === 1 && botMove === 0) ||
          (playerMove === 2 && botMove === 1)
        ? 1
        : -1;
    setStatus(`You: ${names[playerMove]} vs Bot: ${names[botMove]}`);
    setResult(outcome === 0 ? 'Draw' : outcome > 0 ? 'You win!' : 'You lose');
  }, [move]);

  return (
    <main>
      <h1>Rock-paper-scissors on Sui</h1>
      <div className="players">
        <div className="player">Player 1</div>
        <div className="player">Player 2</div>
      </div>

      <section className="actions">
        <div className="row">
          <button className="btn" onClick={handleCreate}>Create Game (testnet)</button>
          <input
            value={gameId}
            onChange={(e) => setGameId(e.target.value)}
            placeholder="Game Object ID"
          />
          <button className="btn" onClick={handleJoin}>Join Game</button>
        </div>

        <div className="row">
          <select value={move} onChange={(e) => setMove(e.target.value)}>
            <option value="0">Rock</option>
            <option value="1">Paper</option>
            <option value="2">Scissors</option>
          </select>
          <input
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Secret"
          />
          <button className="btn" onClick={handleCommit}>Commit</button>
          <button className="btn" onClick={handleReveal}>Reveal</button>
        </div>

        <div className="row">
          <button className="btn" onClick={handleCheck}>Check Winner</button>
          <button className="btn" onClick={handleDemo}>Play-for-fun Demo (local)</button>
          <button className="btn" onClick={handleClaim}>Claim Timeout</button>
        </div>
      </section>

      <p className="note">
        On-chain actions need a Sui wallet.{' '}
        {walletLabel
          ? `Detected: ${walletLabel}.`
          : 'Install Sui Wallet, Suiet, or another provider and reload.'}{' '}
        Package ID: <code>{PACKAGE_ID}</code>
      </p>

      <div className="status">{status}</div>
      <div className="result">{result}</div>
    </main>
  );
};

createRoot(document.getElementById('root')!).render(<App />);
