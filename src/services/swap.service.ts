import { Injectable, Logger } from '@nestjs/common';
import {
  Connection,
  VersionedTransaction,
  VersionedTransactionResponse,
} from '@solana/web3.js';
import { LiquidityPoolKeys } from '@raydium-io/raydium-sdk';
import { RaydiumService } from './raydium.service';
import { getPayerKeypair, getTargetMint } from '../utils';
import { SwapConfig, SwapData } from '../types';

@Injectable()
export class SwapService {
  private readonly connection: Connection;
  private readonly logger = new Logger(SwapService.name);
  private readonly TOKEN_AA_ADDRESS: string = process.env.TOKEN_AA_ADDRESS;
  private readonly TOKEN_AA_DECIMALS: number = Number(
    process.env.TOKEN_AA_DECIMALS,
  );
  private readonly SOLANA_RPC_URL: string = process.env.SOLANA_RPC_URL;
  private readonly SOLANA_WS_URL: string = process.env.SOLANA_WS_URL;
  private readonly TOKEN_AA_AMOUNT: number = Number(
    process.env.TOKEN_AA_AMOUNT,
  );
  private readonly TX_MAX_LAMPORTS: number = Number(process.env.MAX_LAMPORTS);
  private readonly TX_MAX_RETRIES: number = Number(process.env.MAX_RETRIES);
  private readonly TX_DIRECTION: 'in' | 'out' = 'in' as 'in' | 'out';
  private readonly SELLING_TIMEOUT: number = Number(
    process.env.SELLING_TIMEOUT,
  );
  private PAYER_WALLET_PUBLIC_KEY: string;

  constructor(private readonly raydiumService: RaydiumService) {
    this.connection = new Connection(this.SOLANA_RPC_URL, {
      wsEndpoint: this.SOLANA_WS_URL,
      commitment: 'confirmed',
    });

    this.PAYER_WALLET_PUBLIC_KEY = getPayerKeypair().publicKey.toString();
  }

  async processSwap(poolKeys: LiquidityPoolKeys): Promise<string> {
    this.logger.log(`Process Swap initialized`);
    this.logger.log('The token purchase has started.');

    let txIdBuy: string;

    try {
      txIdBuy = await this.swapTokens(
        poolKeys,
        this.getSwapBuyConfig(poolKeys),
      );
    } catch (error) {
      this.logger.error('Get Received Token Amount error: ', error);
      return;
    }

    let receivedAmount: number;

    try {
      receivedAmount = await this.getReceivedTokenAmount(txIdBuy);
    } catch (error) {
      this.logger.error('Get Received Token Amount error: ', error);
      return;
    }

    this.logger.log(
      `New token found, balance: ${receivedAmount}. The token selling has started...`,
    );

    try {
      await this.performSwap(
        poolKeys,
        this.getSwapSellConfig(poolKeys, receivedAmount),
      );
    } catch (error) {
      this.logger.error('Sell a token Error: ', error);
      return;
    }
  }

  async performSwap(poolKeys: LiquidityPoolKeys, swapConfig: SwapConfig) {
    let attempts = 1;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      try {
        await this.swapTokens(poolKeys, swapConfig);
        break;
      } catch (error) {
        this.logger.error(
          `Pelling error on #${attempts} attempt, error: `,
          error,
        );
        attempts++;
        if (attempts >= maxAttempts) {
          throw new Error(
            `PerformSwap failed after ${maxAttempts} attempts. Break.`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 3000 * attempts));
      }
    }
  }

  async getReceivedTokenAmount(transactionSignature: string) {
    await new Promise((resolve) => setTimeout(resolve, this.SELLING_TIMEOUT));

    let receivedAmount = 0;
    let transaction: VersionedTransactionResponse | null;

    try {
      transaction = await this.connection.getTransaction(transactionSignature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
    } catch (error) {
      throw error;
    }

    transaction.meta.postTokenBalances.forEach((item) => {
      if (item.owner === this.PAYER_WALLET_PUBLIC_KEY) {
        receivedAmount = item.uiTokenAmount.uiAmount;
      }
    });

    return receivedAmount;
  }

  getSwapBuyConfig(poolKeys: LiquidityPoolKeys) {
    const { selectedMint, selectedDecimals } = getTargetMint(poolKeys);

    const swapConfig: SwapConfig = {
      tokenAAmount: this.TOKEN_AA_AMOUNT,
      tokenAAddress: this.TOKEN_AA_ADDRESS,
      tokenADecimals: this.TOKEN_AA_DECIMALS,
      tokenBAddress: selectedMint,
      tokenBDecimals: selectedDecimals,
      maxLamports: this.TX_MAX_LAMPORTS,
      direction: this.TX_DIRECTION,
      liquidityFile: 'https://api.raydium.io/v2/sdk/liquidity/mainnet.json',
      maxRetries: this.TX_MAX_RETRIES,
    };

    return swapConfig;
  }

  getSwapSellConfig(poolKeys: LiquidityPoolKeys, tokenBalance: number) {
    const { selectedMint, selectedDecimals } = getTargetMint(poolKeys);

    const swapConfig: SwapConfig = {
      tokenAAmount: tokenBalance,
      tokenAAddress: selectedMint,
      tokenADecimals: selectedDecimals,
      tokenBAddress: this.TOKEN_AA_ADDRESS,
      tokenBDecimals: this.TOKEN_AA_DECIMALS,
      maxLamports: this.TX_MAX_LAMPORTS,
      direction: this.TX_DIRECTION,
      liquidityFile: 'https://api.raydium.io/v2/sdk/liquidity/mainnet.json',
      maxRetries: this.TX_MAX_RETRIES,
    };

    return swapConfig;
  }

  async swapTokens(
    poolKeys: LiquidityPoolKeys,
    swapConfig: SwapConfig,
  ): Promise<string> {
    let swapData: SwapData;

    try {
      swapData = await this.raydiumService.getSwapTransaction(
        poolKeys,
        swapConfig,
      );
    } catch (error) {
      this.logger.error('Get Swap Transaction error: ', error);
      throw new Error(error);
    }

    const { transaction, lastValidBlockHeight } = swapData;

    try {
      const txid: string = await this.raydiumService.sendVersionedTransaction(
        transaction as VersionedTransaction,
        swapConfig.maxRetries,
        lastValidBlockHeight,
      );

      this.logger.log(
        `Transaction has been confirmed https://solscan.io/tx/${txid}`,
      );

      return txid;
    } catch (error) {
      throw error;
    }
  }
}
