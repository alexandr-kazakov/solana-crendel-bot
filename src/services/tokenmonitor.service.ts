import { Injectable, Logger } from '@nestjs/common';
import {
  Connection,
  PublicKey,
  Logs,
  ParsedTransactionWithMeta,
  PartiallyDecodedInstruction,
  ParsedInnerInstruction,
  ParsedInstruction,
} from '@solana/web3.js';
import {
  LiquidityPoolKeysV4,
  MARKET_STATE_LAYOUT_V3,
  Market,
  TOKEN_PROGRAM_ID,
} from '@raydium-io/raydium-sdk';
import { SwapService } from './swap.service';
import { getTargetMint } from '../utils';

@Injectable()
export class TokenMonitorService {
  private readonly logger = new Logger(TokenMonitorService.name);
  private readonly connection: Connection;
  private RAYDIUM_POOL_V4_PROGRAM_ID =
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
  private readonly SOL_DECIMALS = 9;
  private seenTransactions: Array<string> = []; // The log listener is sometimes triggered multiple times for a single transaction, don't react to tranasctions we've already seen
  private poolsCounter = 0;
  private monitoringID: number;
  private readonly IS_BURNED_CHECK: boolean =
    process.env.IS_BURNED_CHECK === 'true';

  constructor(private readonly swapService: SwapService) {
    this.connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      {
        wsEndpoint: process.env.SOLANA_WS_URL,
        commitment: 'confirmed',
      },
    );
  }

  async subscribeToNewRaydiumPools(): Promise<string> {
    this.logger.verbose('Token Monitor Service started, waiting new pools...');

    this.monitoringID = this.connection.onLogs(
      new PublicKey(this.RAYDIUM_POOL_V4_PROGRAM_ID),
      async (txLogs: Logs) => {
        if (this.seenTransactions.includes(txLogs.signature)) {
          return;
        }
        this.seenTransactions.push(txLogs.signature);

        if (!this.findLogEntry('init_pc_amount', txLogs.logs)) {
          return;
        }

        let poolKeys: LiquidityPoolKeysV4;

        try {
          poolKeys = await this.fetchPoolKeysForLPInitTransactionHash(
            txLogs.signature,
          );
        } catch (error) {
          this.logger.warn('PoolKeys fetch error: ', error);
          return;
        }

        const { selectedMint } = getTargetMint(poolKeys);

        if (!(await this.tokenValidation(selectedMint))) {
          this.logger.log(
            'Token is not valid(freezeAuthority, mintAuthority, is not initialized, etc.)',
          );
          return;
        }

        if (this.IS_BURNED_CHECK && !(await this.checkLPBurnt(poolKeys))) {
          this.logger.log('Token is not burned');
          return;
        }

        this.poolsCounter++;
        this.logger.log(
          `#${this.poolsCounter} new valid pool has been found:`,
          poolKeys,
        );

        this.swapService.processSwap(poolKeys);
      },
    );

    return 'Token Monitor Service started';
  }

  stopMonitoringService() {
    this.connection.removeOnLogsListener(this.monitoringID);
    this.logger.verbose(
      'Monitoring service stopped, waiting for current sales to finish...',
    );
  }

  async checkLPBurnt(poolKeys: any) {
    try {
      const amount = await this.connection.getTokenSupply(
        poolKeys.lpMint,
        this.connection.commitment,
      );
      const burned = amount.value.uiAmount === 0;
      return burned;
    } catch (e: any) {
      if (e.code == -32602) {
        return true;
      }

      console.log(
        { mint: poolKeys.baseMint },
        `Failed to check if LP is burned`,
      );
    }

    return false;
  }

  async tokenValidation(tokenAccountAddress) {
    const tokenAccountPubkey = new PublicKey(tokenAccountAddress);
    const tokenAccountInfo =
      await this.connection.getParsedAccountInfo(tokenAccountPubkey);

    if (tokenAccountInfo.value) {
      //@ts-ignore
      const accountData = tokenAccountInfo.value.data.parsed.info;
      const owner = tokenAccountInfo.value.owner; // valids:  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb

      if (
        accountData.freezeAuthority !== null ||
        accountData.mintAuthority !== null ||
        accountData.isInitialized !== true ||
        (owner.toString() !== 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' &&
          owner.toString() !== 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')
      ) {
        return false;
      } else {
        return true;
      }
    } else {
      this.logger.warn('Failed to get Parsed Account Info account info');
      return false;
    }
  }

  preparePoolKeysForPost(data) {
    return {
      id: data.id.toBase58(),
      baseMint: data.baseMint.toBase58(),
      quoteMint: data.quoteMint.toBase58(),
      lpMint: data.lpMint.toBase58(),
      baseDecimals: data.baseDecimals,
      quoteDecimals: data.quoteDecimals,
      lpDecimals: data.lpDecimals,
      version: data.version,
      programId: data.programId.toBase58(),
      authority: data.authority.toBase58(),
      openOrders: data.openOrders.toBase58(),
      targetOrders: data.targetOrders.toBase58(),
      baseVault: data.baseVault.toBase58(),
      quoteVault: data.quoteVault.toBase58(),
      withdrawQueue: data.withdrawQueue.toBase58(),
      lpVault: data.lpVault.toBase58(),
      marketVersion: data.marketVersion,
      marketProgramId: data.marketProgramId.toBase58(),
      marketId: data.marketId.toBase58(),
      marketAuthority: data.marketAuthority.toBase58(),
      marketBaseVault: data.marketBaseVault.toBase58(),
      marketQuoteVault: data.marketQuoteVault.toBase58(),
      marketBids: data.marketBids.toBase58(),
      marketAsks: data.marketAsks.toBase58(),
      marketEventQueue: data.marketEventQueue.toBase58(),
    };
  }

  private findLogEntry(needle: string, logEntries: string[]): string | null {
    for (let i = 0; i < logEntries.length; ++i) {
      if (logEntries[i].includes(needle)) {
        return logEntries[i];
      }
    }
    return null;
  }

  async fetchPoolKeysForLPInitTransactionHash(
    txSignature: string,
  ): Promise<LiquidityPoolKeysV4> {
    const tx = await this.connection.getParsedTransaction(txSignature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      throw new Error(
        'Failed to fetch transaction with signature ' + txSignature,
      );
    }
    const poolInfo = this.parsePoolInfoFromLpTransaction(tx);
    const marketInfo = await this.fetchMarketInfo(poolInfo.marketId);

    return {
      id: poolInfo.id,
      baseMint: poolInfo.baseMint,
      quoteMint: poolInfo.quoteMint,
      lpMint: poolInfo.lpMint,
      baseDecimals: poolInfo.baseDecimals,
      quoteDecimals: poolInfo.quoteDecimals,
      lpDecimals: poolInfo.lpDecimals,
      version: 4,
      programId: poolInfo.programId,
      authority: poolInfo.authority,
      openOrders: poolInfo.openOrders,
      targetOrders: poolInfo.targetOrders,
      baseVault: poolInfo.baseVault,
      quoteVault: poolInfo.quoteVault,
      withdrawQueue: poolInfo.withdrawQueue,
      lpVault: poolInfo.lpVault,
      marketVersion: 3,
      marketProgramId: poolInfo.marketProgramId,
      marketId: poolInfo.marketId,
      marketAuthority: Market.getAssociatedAuthority({
        programId: poolInfo.marketProgramId,
        marketId: poolInfo.marketId,
      }).publicKey,
      marketBaseVault: marketInfo.baseVault,
      marketQuoteVault: marketInfo.quoteVault,
      marketBids: marketInfo.bids,
      marketAsks: marketInfo.asks,
      marketEventQueue: marketInfo.eventQueue,
    } as LiquidityPoolKeysV4;
  }

  async fetchMarketInfo(marketId: PublicKey) {
    const marketAccountInfo = await this.connection.getAccountInfo(marketId);
    if (!marketAccountInfo) {
      throw new Error(
        'Failed to fetch market info for market id ' + marketId.toBase58(),
      );
    }

    return MARKET_STATE_LAYOUT_V3.decode(marketAccountInfo.data);
  }

  async showLogs(txData: ParsedTransactionWithMeta) {
    // @ts-ignore
    const { accounts } = txData?.transaction.message.instructions.find(
      (ix) => ix.programId.toBase58() === this.RAYDIUM_POOL_V4_PROGRAM_ID,
    );

    if (!accounts) {
      console.log('No accounts found in the transaction.');
      return;
    }

    const tokenAIndex = 8;
    const tokenBIndex = 9;
    const tokenAAccount = accounts[tokenAIndex];
    const tokenBAccount = accounts[tokenBIndex];

    const displayData = [
      { Token: 'A', 'Account Public Key': tokenAAccount.toBase58() },
      { Token: 'B', 'Account Public Key': tokenBAccount.toBase58() },
    ];
    this.logger.log('New LP Found: ');
    console.table(displayData);
  }

  parsePoolInfoFromLpTransaction(txData: ParsedTransactionWithMeta) {
    const initInstruction = this.findInstructionByProgramId(
      txData.transaction.message.instructions,
      new PublicKey(this.RAYDIUM_POOL_V4_PROGRAM_ID),
    ) as PartiallyDecodedInstruction | null;
    if (!initInstruction) {
      throw new Error('Failed to find lp init instruction in lp init tx');
    }

    this.showLogs(txData);

    const baseMint = initInstruction.accounts[8];
    const baseVault = initInstruction.accounts[10];
    const quoteMint = initInstruction.accounts[9];
    const quoteVault = initInstruction.accounts[11];
    const lpMint = initInstruction.accounts[7];
    const lpMintInitInstruction =
      this.findInitializeMintInInnerInstructionsByMintAddress(
        txData.meta?.innerInstructions ?? [],
        lpMint,
      );
    if (!lpMintInitInstruction) {
      throw new Error('Failed to find lp mint init instruction in lp init tx');
    }

    const lpMintInstruction = this.findMintToInInnerInstructionsByMintAddress(
      txData.meta?.innerInstructions ?? [],
      lpMint,
    );
    if (!lpMintInstruction) {
      throw new Error('Failed to find lp mint to instruction in lp init tx');
    }
    const baseTransferInstruction =
      this.findTransferInstructionInInnerInstructionsByDestination(
        txData.meta?.innerInstructions ?? [],
        baseVault,
        TOKEN_PROGRAM_ID,
      );
    if (!baseTransferInstruction) {
      throw new Error('Failed to find base transfer instruction in lp init tx');
    }
    const quoteTransferInstruction =
      this.findTransferInstructionInInnerInstructionsByDestination(
        txData.meta?.innerInstructions ?? [],
        quoteVault,
        TOKEN_PROGRAM_ID,
      );
    if (!quoteTransferInstruction) {
      throw new Error(
        'Failed to find quote transfer instruction in lp init tx',
      );
    }
    const lpDecimals = lpMintInitInstruction.parsed.info.decimals;
    const lpInitializationLogEntryInfo =
      this.extractLPInitializationLogEntryInfoFromLogEntry(
        this.findLogEntry('init_pc_amount', txData.meta?.logMessages ?? []) ??
          '',
      );
    const basePreBalance = (txData.meta?.preTokenBalances ?? []).find(
      (balance) => balance.mint === baseMint.toBase58(),
    );

    if (!basePreBalance) {
      throw new Error(
        'Failed to find base tokens preTokenBalance entry to parse the base tokens decimals',
      );
    }

    let selectedDecimals;

    (txData.meta?.preTokenBalances ?? []).forEach((item) => {
      if (item.mint !== 'So11111111111111111111111111111111111111112') {
        selectedDecimals = item.uiTokenAmount.decimals;
      }
    });

    return {
      id: initInstruction.accounts[4],
      baseMint,
      quoteMint,
      lpMint,
      baseDecimals:
        baseMint.toString() === 'So11111111111111111111111111111111111111112'
          ? this.SOL_DECIMALS
          : selectedDecimals,
      quoteDecimals:
        baseMint.toString() === 'So11111111111111111111111111111111111111112'
          ? selectedDecimals
          : this.SOL_DECIMALS,
      lpDecimals,
      version: 4,
      programId: new PublicKey(this.RAYDIUM_POOL_V4_PROGRAM_ID),
      authority: initInstruction.accounts[5],
      openOrders: initInstruction.accounts[6],
      targetOrders: initInstruction.accounts[13],
      baseVault,
      quoteVault,
      withdrawQueue: new PublicKey('11111111111111111111111111111111'),
      lpVault: new PublicKey(lpMintInstruction.parsed.info.account),
      marketVersion: 3,
      marketProgramId: initInstruction.accounts[15],
      marketId: initInstruction.accounts[16],
      baseReserve: parseInt(baseTransferInstruction.parsed.info.amount),
      quoteReserve: parseInt(quoteTransferInstruction.parsed.info.amount),
      lpReserve: parseInt(lpMintInstruction.parsed.info.amount),
      openTime: lpInitializationLogEntryInfo.open_time,
    };
  }

  findTransferInstructionInInnerInstructionsByDestination(
    innerInstructions: Array<ParsedInnerInstruction>,
    destinationAccount: PublicKey,
    programId?: PublicKey,
  ): ParsedInstruction | null {
    for (let i = 0; i < innerInstructions.length; i++) {
      for (let y = 0; y < innerInstructions[i].instructions.length; y++) {
        const instruction = innerInstructions[i].instructions[
          y
        ] as ParsedInstruction;
        if (!instruction.parsed) {
          continue;
        }
        if (
          instruction.parsed.type === 'transfer' &&
          instruction.parsed.info.destination ===
            destinationAccount.toBase58() &&
          (!programId || instruction.programId.equals(programId))
        ) {
          return instruction;
        }
      }
    }

    return null;
  }

  findInitializeMintInInnerInstructionsByMintAddress(
    innerInstructions: Array<ParsedInnerInstruction>,
    mintAddress: PublicKey,
  ): ParsedInstruction | null {
    for (let i = 0; i < innerInstructions.length; i++) {
      for (let y = 0; y < innerInstructions[i].instructions.length; y++) {
        const instruction = innerInstructions[i].instructions[
          y
        ] as ParsedInstruction;
        if (!instruction.parsed) {
          continue;
        }
        if (
          instruction.parsed.type === 'initializeMint' &&
          instruction.parsed.info.mint === mintAddress.toBase58()
        ) {
          return instruction;
        }
      }
    }

    return null;
  }

  findMintToInInnerInstructionsByMintAddress(
    innerInstructions: Array<ParsedInnerInstruction>,
    mintAddress: PublicKey,
  ): ParsedInstruction | null {
    for (let i = 0; i < innerInstructions.length; i++) {
      for (let y = 0; y < innerInstructions[i].instructions.length; y++) {
        const instruction = innerInstructions[i].instructions[
          y
        ] as ParsedInstruction;
        if (!instruction.parsed) {
          continue;
        }
        if (
          instruction.parsed.type === 'mintTo' &&
          instruction.parsed.info.mint === mintAddress.toBase58()
        ) {
          return instruction;
        }
      }
    }

    return null;
  }

  findInstructionByProgramId(
    instructions: Array<ParsedInstruction | PartiallyDecodedInstruction>,
    programId: PublicKey,
  ): ParsedInstruction | PartiallyDecodedInstruction | null {
    for (let i = 0; i < instructions.length; i++) {
      if (instructions[i].programId.equals(programId)) {
        return instructions[i];
      }
    }

    return null;
  }

  extractLPInitializationLogEntryInfoFromLogEntry(lpLogEntry: string): {
    nonce: number;
    open_time: number;
    init_pc_amount: number;
    init_coin_amount: number;
  } {
    const lpInitializationLogEntryInfoStart = lpLogEntry.indexOf('{');

    return JSON.parse(
      this.fixRelaxedJsonInLpLogEntry(
        lpLogEntry.substring(lpInitializationLogEntryInfoStart),
      ),
    );
  }

  fixRelaxedJsonInLpLogEntry(relaxedJson: string): string {
    return relaxedJson.replace(
      /([{,])\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g,
      '$1"$2":',
    );
  }
}
