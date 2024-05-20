import { Module } from '@nestjs/common';
import { TokenMonitorController } from '../controllers/tokenmonitor.controller';
import { TokenMonitorService } from 'src/services/tokenmonitor.service';
import { SwapService } from 'src/services/swap.service';
import { RaydiumService } from 'src/services/raydium.service';

@Module({
  controllers: [TokenMonitorController],
  providers: [TokenMonitorService, SwapService, RaydiumService],
})
export class TokenMonitorModule {}
