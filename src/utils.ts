import { Wallet } from '@coral-xyz/anchor';
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes';
import { LiquidityPoolKeys } from '@raydium-io/raydium-sdk';
import { Keypair } from '@solana/web3.js';

export function getTargetMint(poolKeys: LiquidityPoolKeys) {
  let selectedMint = poolKeys.quoteMint;
  let selectedDecimals = poolKeys.quoteDecimals;

  if (
    poolKeys.baseMint.toString() !==
    'So11111111111111111111111111111111111111112'
  ) {
    selectedMint = poolKeys.baseMint;
    selectedDecimals = poolKeys.baseDecimals;
  }

  return {
    selectedMint: selectedMint.toString(),
    selectedDecimals,
  };
}

export function getPayerKeypair() {
  const PAYER_WALLET_PRIVATE_KEY = process.env.PAYER_WALLET_PRIVATE_KEY;

  return new Wallet(
    Keypair.fromSecretKey(
      Uint8Array.from(bs58.decode(PAYER_WALLET_PRIVATE_KEY)),
    ),
  );
}
