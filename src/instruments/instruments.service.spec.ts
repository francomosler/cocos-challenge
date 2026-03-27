import { Test, TestingModule } from '@nestjs/testing';
import { InstrumentsService } from './instruments.service';
import { PrismaService } from '../prisma/prisma.service';

describe('InstrumentsService', () => {
  let service: InstrumentsService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstrumentsService,
        {
          provide: PrismaService,
          useValue: { $queryRaw: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<InstrumentsService>(InstrumentsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should return mapped instruments with daily return', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      {
        id: 47,
        ticker: 'PAMP',
        name: 'Pampa Holding S.A.',
        type: 'ACCIONES',
        last_price: 925.85,
        previous_close: 921.8,
      },
    ]);

    const result = await service.search('PAMP');

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 47,
      ticker: 'PAMP',
      name: 'Pampa Holding S.A.',
      type: 'ACCIONES',
      lastPrice: 925.85,
      dailyReturn: expect.any(Number),
    });
    expect(result[0].dailyReturn).toBeCloseTo(0.44, 1);
  });

  it('should return null lastPrice and dailyReturn when market data is missing', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      {
        id: 10,
        ticker: 'TEST',
        name: 'Test Corp',
        type: 'ACCIONES',
        last_price: null,
        previous_close: null,
      },
    ]);

    const result = await service.search('TEST');

    expect(result[0].lastPrice).toBeNull();
    expect(result[0].dailyReturn).toBeNull();
  });

  it('should return null dailyReturn when previousClose is zero', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      {
        id: 10,
        ticker: 'TEST',
        name: 'Test Corp',
        type: 'ACCIONES',
        last_price: 100,
        previous_close: 0,
      },
    ]);

    const result = await service.search('TEST');

    expect(result[0].lastPrice).toBe(100);
    expect(result[0].dailyReturn).toBeNull();
  });

  it('should return empty array when no results match', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

    const result = await service.search('ZZZZZ');

    expect(result).toEqual([]);
  });
});
