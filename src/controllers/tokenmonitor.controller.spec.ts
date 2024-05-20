import { Test, TestingModule } from '@nestjs/testing';
import { TokenMonitorController } from './tokenmonitor.controller';
import { TokenMonitorService } from '../services/tokenmonitor.service';

describe('TokenMonitorController', () => {
  let tokenMonitorController: TokenMonitorController;
  let tokenMonitorService: TokenMonitorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TokenMonitorController],
      providers: [
        {
          provide: TokenMonitorService,
          useValue: {
            subscribeToNewRaydiumPools: jest
              .fn()
              .mockResolvedValue('Monitoring started'),
            stopMonitoringService: jest.fn(),
          },
        },
      ],
    }).compile();

    tokenMonitorController = module.get<TokenMonitorController>(
      TokenMonitorController,
    );
    tokenMonitorService = module.get<TokenMonitorService>(TokenMonitorService);
  });

  it('should be defined', () => {
    expect(tokenMonitorController).toBeDefined();
  });

  describe('startTokenMonitorService', () => {
    it('should return "Monitoring started"', async () => {
      const result = await tokenMonitorController.startTokenMonitorService();
      expect(result).toBe('Monitoring started');
      expect(tokenMonitorService.subscribeToNewRaydiumPools).toHaveBeenCalled();
    });
  });

  describe('stopMonitoring', () => {
    it('should return "Monitoring service stopped, waiting for current sales to finish..."', () => {
      const result = tokenMonitorController.stopMonitoring();
      expect(result).toBe(
        'Monitoring service stopped, waiting for current sales to finish...',
      );
      expect(tokenMonitorService.stopMonitoringService).toHaveBeenCalled();
    });
  });
});
