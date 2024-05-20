import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { TokenMonitorService } from '../services/tokenmonitor.service';

@Controller('api/monitor')
export class TokenMonitorController {
  constructor(private readonly tokenMonitorService: TokenMonitorService) {}

  @Post('start')
  @HttpCode(HttpStatus.ACCEPTED)
  async startTokenMonitorService(): Promise<string> {
    return await this.tokenMonitorService.subscribeToNewRaydiumPools();
  }

  @Post('stop')
  @HttpCode(HttpStatus.ACCEPTED)
  stopMonitoring(): string {
    this.tokenMonitorService.stopMonitoringService();
    return 'Monitoring service stopped, waiting for current sales to finish...';
  }
}
