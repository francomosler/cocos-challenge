import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PortfolioService } from './portfolio.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PortfolioService', () => {
  let service: PortfolioService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortfolioService,
        {
          provide: PrismaService,
          useValue: {
            users: { findUnique: jest.fn() },
            $queryRaw: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PortfolioService>(PortfolioService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should throw NotFoundException when user does not exist', async () => {
    (prisma.users.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.getPortfolio(999)).rejects.toThrow(NotFoundException);
  });

  it('should return portfolio with positions and calculated values', async () => {
    (prisma.users.findUnique as jest.Mock).mockResolvedValue({
      id: 1,
      email: 'test@test.com',
    });

    let callIndex = 0;
    (prisma.$queryRaw as jest.Mock).mockImplementation(() => {
      const idx = callIndex++;
      if (idx === 0) return Promise.resolve([{ available_cash: 50000 }]);
      if (idx === 1)
        return Promise.resolve([
          {
            instrument_id: 47,
            ticker: 'PAMP',
            name: 'Pampa Holding S.A.',
            quantity: 10,
            last_price: 1000,
            previous_close: 950,
          },
        ]);
      return Promise.resolve([]);
    });

    const result = await service.getPortfolio(1);

    expect(result.availableCash).toBe(50000);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].ticker).toBe('PAMP');
    expect(result.positions[0].quantity).toBe(10);
    expect(result.positions[0].marketValue).toBe(10000);
    expect(result.positions[0].dailyReturn).toBeCloseTo(5.26, 1);
    expect(result.totalAccountValue).toBe(60000);
  });

  it('should return portfolio with zero positions', async () => {
    (prisma.users.findUnique as jest.Mock).mockResolvedValue({ id: 2 });

    let callIndex = 0;
    (prisma.$queryRaw as jest.Mock).mockImplementation(() => {
      const idx = callIndex++;
      if (idx === 0) return Promise.resolve([{ available_cash: 100000 }]);
      if (idx === 1) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const result = await service.getPortfolio(2);

    expect(result.positions).toEqual([]);
    expect(result.availableCash).toBe(100000);
    expect(result.totalAccountValue).toBe(100000);
  });

  it('should handle null market data in positions gracefully', async () => {
    (prisma.users.findUnique as jest.Mock).mockResolvedValue({ id: 1 });

    let callIndex = 0;
    (prisma.$queryRaw as jest.Mock).mockImplementation(() => {
      const idx = callIndex++;
      if (idx === 0) return Promise.resolve([{ available_cash: 0 }]);
      if (idx === 1)
        return Promise.resolve([
          {
            instrument_id: 10,
            ticker: 'TEST',
            name: 'Test Corp',
            quantity: 5,
            last_price: null,
            previous_close: null,
          },
        ]);
      return Promise.resolve([]);
    });

    const result = await service.getPortfolio(1);

    expect(result.positions[0].lastPrice).toBe(0);
    expect(result.positions[0].marketValue).toBe(0);
    expect(result.positions[0].dailyReturn).toBe(0);
  });

  it('should return 0 when available_cash query returns empty', async () => {
    (prisma.users.findUnique as jest.Mock).mockResolvedValue({ id: 1 });

    let callIndex = 0;
    (prisma.$queryRaw as jest.Mock).mockImplementation(() => {
      const idx = callIndex++;
      if (idx === 0) return Promise.resolve([]);
      if (idx === 1) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const result = await service.getPortfolio(1);

    expect(result.availableCash).toBe(0);
  });
});
