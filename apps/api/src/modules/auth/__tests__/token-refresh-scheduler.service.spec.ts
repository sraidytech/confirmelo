import { Test, TestingModule } from '@nestjs/testing';
import { TokenRefreshSchedulerService } from '../services/token-refresh-scheduler.service';
import { PrismaService } from '../../../common/database/prisma.service';
import { OAuth2Service } from '../services/oauth2.service';
import { OAuth2ConfigService } from '../services/oauth2-config.service';
import { ConfigService } from '@nestjs/config';
import { ConnectionStatus, PlatformType } from '@prisma/client';

describe('TokenRefreshSchedulerService', () => {
  let service: TokenRefreshSchedulerService;
  let prismaService: PrismaService;
  let oauth2Service: OAuth2Service;
  let oauth2ConfigService: OAuth2ConfigService;

  const mockConnections = [
    {
      id: 'connection-1',
      platformType: PlatformType.GOOGLE_SHEETS,
      platformName: 'Google Sheets - user1@gmail.com',
      status: ConnectionStatus.ACTIVE,
      accessToken: 'encrypted-access-token-1',
      refreshToken: 'encrypted-refresh-token-1',
      tokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000), // Expires in 10 minutes
      platformUserId: 'google-user-1',
      platformStoreId: null,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      userId: 'user-1',
      organizationId: 'org-1',
      lastSyncAt: new Date(),
      lastErrorAt: null,
      lastErrorMessage: null,
      syncCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      platformData: { google_email: 'user1@gmail.com' },
      spreadsheetConnections: [],
    },
    {
      id: 'connection-2',
      platformType: PlatformType.YOUCAN,
      platformName: 'Youcan Shop',
      status: ConnectionStatus.ACTIVE,
      accessToken: 'encrypted-access-token-2',
      refreshToken: 'encrypted-refresh-token-2',
      tokenExpiresAt: new Date(Date.now() + 5 * 60 * 1000), // Expires in 5 minutes
      platformUserId: 'youcan-user-1',
      platformStoreId: 'store-123',
      scopes: ['read_orders', 'write_orders'],
      userId: 'user-2',
      organizationId: 'org-1',
      lastSyncAt: new Date(),
      lastErrorAt: null,
      lastErrorMessage: null,
      syncCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      platformData: { shop_domain: 'test-shop.youcan.shop' },
      spreadsheetConnections: [],
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenRefreshSchedulerService,
        {
          provide: PrismaService,
          useValue: {
            platformConnection: {
              findMany: jest.fn(),
              count: jest.fn(),
            },
          },
        },
        {
          provide: OAuth2Service,
          useValue: {
            validateAndRefreshToken: jest.fn(),
          },
        },
        {
          provide: OAuth2ConfigService,
          useValue: {
            getConfig: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'TOKEN_REFRESH_INTERVAL_MS') return 5000; // 5 seconds for testing
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<TokenRefreshSchedulerService>(TokenRefreshSchedulerService);
    prismaService = module.get<PrismaService>(PrismaService);
    oauth2Service = module.get<OAuth2Service>(OAuth2Service);
    oauth2ConfigService = module.get<OAuth2ConfigService>(OAuth2ConfigService);
  });

  afterEach(() => {
    // Stop any running schedulers
    service.onModuleDestroy();
  });

  describe('Token Refresh Detection', () => {
    it('should identify connections needing token refresh', async () => {
      jest.spyOn(prismaService.platformConnection, 'findMany').mockResolvedValue(mockConnections);
      jest.spyOn(oauth2Service, 'validateAndRefreshToken').mockResolvedValue(true);

      await service.checkAndRefreshTokens();

      expect(prismaService.platformConnection.findMany).toHaveBeenCalledWith({
        where: {
          status: ConnectionStatus.ACTIVE,
          tokenExpiresAt: {
            lte: expect.any(Date), // 15 minutes from now
          },
          refreshToken: {
            not: null,
          },
        },
        select: {
          id: true,
          platformType: true,
          platformName: true,
          tokenExpiresAt: true,
          userId: true,
          organizationId: true,
          platformData: true,
        },
      });

      expect(oauth2Service.validateAndRefreshToken).toHaveBeenCalledTimes(2);
      expect(oauth2Service.validateAndRefreshToken).toHaveBeenCalledWith('connection-1');
      expect(oauth2Service.validateAndRefreshToken).toHaveBeenCalledWith('connection-2');
    });

    it('should handle refresh failures gracefully', async () => {
      jest.spyOn(prismaService.platformConnection, 'findMany').mockResolvedValue([mockConnections[0]]);
      jest.spyOn(oauth2Service, 'validateAndRefreshToken').mockRejectedValue(
        new Error('Refresh token expired')
      );

      // Should not throw error
      await expect(service.checkAndRefreshTokens()).resolves.not.toThrow();

      expect(oauth2Service.validateAndRefreshToken).toHaveBeenCalledWith('connection-1');
    });

    it('should skip refresh when no connections need it', async () => {
      jest.spyOn(prismaService.platformConnection, 'findMany').mockResolvedValue([]);
      jest.spyOn(oauth2Service, 'validateAndRefreshToken').mockResolvedValue(true);

      await service.checkAndRefreshTokens();

      expect(oauth2Service.validateAndRefreshToken).not.toHaveBeenCalled();
    });
  });

  describe('Token Health Monitoring', () => {
    it('should provide accurate token health status', async () => {
      const now = new Date();
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

      // Mock count queries
      jest.spyOn(prismaService.platformConnection, 'count')
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(8)  // active
        .mockResolvedValueOnce(3)  // expiring soon
        .mockResolvedValueOnce(2); // expired

      const healthStatus = await service.getTokenHealthStatus();

      expect(healthStatus).toEqual({
        total: 10,
        active: 8,
        expiringSoon: 3,
        expired: 2,
        needingRefresh: 5, // expiringSoon + expired
      });

      // Verify count queries were called with correct parameters
      expect(prismaService.platformConnection.count).toHaveBeenCalledTimes(4);
    });

    it('should handle database errors in health check', async () => {
      jest.spyOn(prismaService.platformConnection, 'count').mockRejectedValue(
        new Error('Database connection failed')
      );

      const healthStatus = await service.getTokenHealthStatus();

      expect(healthStatus).toEqual({
        total: 0,
        active: 0,
        expiringSoon: 0,
        expired: 0,
        needingRefresh: 0,
      });
    });
  });

  describe('Scheduler Management', () => {
    it('should start and stop scheduler properly', async () => {
      const schedulerStatus = service.getSchedulerStatus();
      
      expect(schedulerStatus.isRunning).toBe(false);
      expect(schedulerStatus.intervalMs).toBe(5000);
      expect(schedulerStatus.intervalMinutes).toBe(5000 / 60000);

      // Start scheduler
      await service.onModuleInit();
      
      const runningStatus = service.getSchedulerStatus();
      expect(runningStatus.isRunning).toBe(true);

      // Stop scheduler
      await service.onModuleDestroy();
      
      const stoppedStatus = service.getSchedulerStatus();
      expect(stoppedStatus.isRunning).toBe(false);
    });

    it('should handle manual trigger', async () => {
      jest.spyOn(prismaService.platformConnection, 'findMany').mockResolvedValue([]);
      jest.spyOn(service, 'checkAndRefreshTokens');

      await service.triggerRefreshCheck();

      expect(service.checkAndRefreshTokens).toHaveBeenCalled();
    });
  });

  describe('Concurrent Refresh Handling', () => {
    it('should process multiple connections in parallel', async () => {
      const manyConnections = Array.from({ length: 10 }, (_, i) => ({
        ...mockConnections[0],
        id: `connection-${i}`,
        platformName: `Google Sheets - user${i}@gmail.com`,
      }));

      jest.spyOn(prismaService.platformConnection, 'findMany').mockResolvedValue(manyConnections);
      jest.spyOn(oauth2Service, 'validateAndRefreshToken').mockImplementation(
        (connectionId: string) => {
          // Simulate different response times
          const delay = Math.random() * 100;
          return new Promise(resolve => setTimeout(() => resolve(true), delay));
        }
      );

      const startTime = Date.now();
      await service.checkAndRefreshTokens();
      const endTime = Date.now();

      // Should complete in reasonable time (parallel processing)
      expect(endTime - startTime).toBeLessThan(1000); // Less than 1 second
      expect(oauth2Service.validateAndRefreshToken).toHaveBeenCalledTimes(10);
    });

    it('should handle mixed success and failure results', async () => {
      jest.spyOn(prismaService.platformConnection, 'findMany').mockResolvedValue(mockConnections);
      jest.spyOn(oauth2Service, 'validateAndRefreshToken')
        .mockResolvedValueOnce(true)  // First connection succeeds
        .mockRejectedValueOnce(new Error('Refresh failed')); // Second connection fails

      // Should not throw error despite one failure
      await expect(service.checkAndRefreshTokens()).resolves.not.toThrow();

      expect(oauth2Service.validateAndRefreshToken).toHaveBeenCalledTimes(2);
    });
  });

  describe('Performance Optimization', () => {
    it('should limit database queries efficiently', async () => {
      const largeConnectionSet = Array.from({ length: 100 }, (_, i) => ({
        ...mockConnections[0],
        id: `connection-${i}`,
      }));

      jest.spyOn(prismaService.platformConnection, 'findMany').mockResolvedValue(largeConnectionSet);
      jest.spyOn(oauth2Service, 'validateAndRefreshToken').mockResolvedValue(true);

      await service.checkAndRefreshTokens();

      // Should only make one database query to find connections
      expect(prismaService.platformConnection.findMany).toHaveBeenCalledTimes(1);
      
      // Should process all connections
      expect(oauth2Service.validateAndRefreshToken).toHaveBeenCalledTimes(100);
    });

    it('should use appropriate date ranges for token expiration', async () => {
      jest.spyOn(prismaService.platformConnection, 'findMany').mockResolvedValue([]);

      await service.checkAndRefreshTokens();

      const callArgs = (prismaService.platformConnection.findMany as jest.Mock).mock.calls[0][0];
      const expirationDate = callArgs.where.tokenExpiresAt.lte;
      
      // Should look for tokens expiring within 15 minutes
      const now = new Date();
      const fifteenMinutesFromNow = new Date(now.getTime() + 15 * 60 * 1000);
      
      expect(expirationDate.getTime()).toBeCloseTo(fifteenMinutesFromNow.getTime(), -3); // Within 1 second
    });
  });
});