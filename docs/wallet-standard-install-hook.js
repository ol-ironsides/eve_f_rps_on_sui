import { getWallets } from '@wallet-standard/app';

// Invoke the registry bootstrap that wallet extensions expect.
const registry = getWallets();

if (typeof window !== 'undefined') {
  const globalScope = window;
  if (!globalScope.__walletStandardInstalled) {
    globalScope.__walletStandardInstalled = true;
    console.debug('[rps-wallet] wallet-standard install hook executed');
  }
}

export { registry };
