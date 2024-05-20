import {
  BlockhashWithExpiryBlockHeight,
  VersionedTransaction,
} from '@solana/web3.js';

export interface SwapConfig {
  tokenAAmount: number;
  tokenAAddress: string;
  tokenADecimals: number;
  tokenBAddress: string;
  tokenBDecimals: number;
  maxLamports: number;
  direction: 'in' | 'out';
  liquidityFile: string;
  maxRetries: number;
}

export interface SwapData {
  transaction: VersionedTransaction;
  lastValidBlockHeight: BlockhashWithExpiryBlockHeight;
}
