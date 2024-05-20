import { Injectable, Logger } from '@nestjs/common';
import {
  BlockhashWithExpiryBlockHeight,
  Connection,
  PublicKey,
  TransactionMessage,
  TransactionSignature,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  Liquidity,
  LiquidityPoolKeys,
  Token,
  TokenAmount,
  TOKEN_PROGRAM_ID,
  SPL_ACCOUNT_LAYOUT,
  Percent,
} from '@raydium-io/raydium-sdk';
import { Wallet } from '@coral-xyz/anchor';
import { SwapConfig } from '../types';
import { getPayerKeypair } from '../utils';

@Injectable()
export class RaydiumService {
  private readonly connection: Connection;
  private readonly wallet: Wallet;
  private readonly logger = new Logger(RaydiumService.name);

  constructor() {
    const RPC_URL =
      process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

    this.connection = new Connection(RPC_URL, { commitment: 'confirmed' });
    this.wallet = getPayerKeypair();
  }

  async getSwapTransaction(
    poolKeys: LiquidityPoolKeys,
    swapConfig: SwapConfig,
  ): Promise<any> {
    const { amountIn, minAmountOut } = await this.calcAmountOut(swapConfig);
    const userTokenAccounts = await this.getOwnerTokenAccounts();

    const swapTransaction = await Liquidity.makeSwapInstructionSimple({
      connection: this.connection,
      makeTxVersion: 0,
      poolKeys: {
        ...poolKeys,
      },
      userKeys: {
        tokenAccounts: userTokenAccounts,
        owner: this.wallet.publicKey,
      },
      amountIn,
      amountOut: minAmountOut,
      fixedSide: swapConfig.direction,
      config: {
        bypassAssociatedCheck: false,
      },
      computeBudgetConfig: {
        microLamports: swapConfig.maxLamports,
      },
    });

    const recentBlockhashForSwap: BlockhashWithExpiryBlockHeight =
      await this.connection.getLatestBlockhash();
    const instructions =
      swapTransaction.innerTransactions[0].instructions.filter(Boolean);

    this.logger.log('Transaction created');

    const versionedTransaction = new VersionedTransaction(
      new TransactionMessage({
        payerKey: this.wallet.publicKey,
        recentBlockhash: recentBlockhashForSwap.blockhash,
        instructions: instructions,
      }).compileToV0Message(),
    );

    versionedTransaction.sign([this.wallet.payer]);

    return {
      transaction: versionedTransaction,
      lastValidBlockHeight: recentBlockhashForSwap,
    };
  }

  async getOwnerTokenAccounts() {
    const walletTokenAccount = await this.connection.getTokenAccountsByOwner(
      this.wallet.publicKey,
      {
        programId: TOKEN_PROGRAM_ID,
      },
    );

    return walletTokenAccount.value.map((i) => ({
      pubkey: i.pubkey,
      programId: i.account.owner,
      accountInfo: SPL_ACCOUNT_LAYOUT.decode(i.account.data),
    }));
  }

  async calcAmountOut(swapConfig: SwapConfig) {
    const tokenAA = new Token(
      TOKEN_PROGRAM_ID,
      new PublicKey(swapConfig.tokenAAddress),
      swapConfig.tokenADecimals,
    );

    const tokenBB = new Token(
      TOKEN_PROGRAM_ID,
      new PublicKey(swapConfig.tokenBAddress),
      swapConfig.tokenBDecimals,
    );

    const amountIn = new TokenAmount(tokenAA, swapConfig.tokenAAmount, false);
    const minAmountOut = new TokenAmount(tokenBB, 1);

    return { amountIn, minAmountOut };
  }

  async calcAmountOutTwo(poolKeys: LiquidityPoolKeys, swapConfig: SwapConfig) {
    const swapInDirection =
      poolKeys.quoteMint.toString() === swapConfig.tokenBAddress;

    const poolInfo = await Liquidity.fetchInfo({
      connection: this.connection,
      poolKeys,
    });

    let currencyInMint = poolKeys.baseMint;
    let currencyInDecimals = poolInfo.baseDecimals;
    let currencyOutMint = poolKeys.quoteMint;
    let currencyOutDecimals = poolInfo.quoteDecimals;

    if (!swapInDirection) {
      currencyInMint = poolKeys.quoteMint;
      currencyInDecimals = poolInfo.quoteDecimals;
      currencyOutMint = poolKeys.baseMint;
      currencyOutDecimals = poolInfo.baseDecimals;
    }

    const currencyIn = new Token(
      TOKEN_PROGRAM_ID,
      currencyInMint,
      currencyInDecimals,
    );
    const amountIn = new TokenAmount(
      currencyIn,
      swapConfig.tokenAAmount,
      false,
    );
    const currencyOut = new Token(
      TOKEN_PROGRAM_ID,
      currencyOutMint,
      currencyOutDecimals,
    );
    const slippage = new Percent(10, 100); // 10%

    const {
      amountOut,
      minAmountOut,
      currentPrice,
      executionPrice,
      priceImpact,
      fee,
    } = Liquidity.computeAmountOut({
      poolKeys,
      poolInfo,
      amountIn,
      currencyOut,
      slippage,
    });

    return {
      amountIn,
      amountOut,
      minAmountOut,
      currentPrice,
      executionPrice,
      priceImpact,
      fee,
    };
  }

  async sendVersionedTransaction(
    tx: VersionedTransaction,
    maxRetries?: number,
    blockHash?: any,
  ) {
    const rawTransaction = tx.serialize();

    const signature: TransactionSignature =
      await this.connection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
        maxRetries,
      });

    this.logger.log('Transaction sent. Waiting confirmation...');

    const confirmation = await this.connection.confirmTransaction({
      blockhash: blockHash.blockhash,
      lastValidBlockHeight: blockHash.lastValidBlockHeight,
      signature,
    });

    if (confirmation.value.err) {
      throw new Error('❌ - Transaction is not confirmed. Break.');
    }

    this.logger.log('✅ - Transaction confirmed.');

    return signature;
  }
}
