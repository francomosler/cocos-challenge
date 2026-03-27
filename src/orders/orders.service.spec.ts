import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrderSide, OrderType } from './dto/create-order.dto';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: PrismaService;

  const mockUser = { id: 1, email: 'test@test.com', accountnumber: '10001' };
  const mockInstrument = {
    id: 47,
    ticker: 'PAMP',
    name: 'Pampa Holding S.A.',
    type: 'ACCIONES',
  };

  function createMockTx(overrides: {
    availableCash?: number;
    sharesOwned?: number;
    marketClose?: number;
    user?: any;
    instrument?: any;
  }) {
    const {
      availableCash = 100000,
      sharesOwned = 50,
      marketClose = 925.85,
      user = mockUser,
      instrument = mockInstrument,
    } = overrides;

    let queryRawCallIndex = 0;
    const createdOrders: any[] = [];

    return {
      $queryRaw: jest.fn().mockImplementation(() => {
        const callIndex = queryRawCallIndex++;
        if (callIndex === 0) {
          return Promise.resolve([{ pg_advisory_xact_lock: '' }]);
        }
        if (callIndex === 1) {
          return Promise.resolve([{ close: marketClose }]);
        }
        if (callIndex === 2) {
          return Promise.resolve([
            { available_cash: availableCash, shares_owned: sharesOwned },
          ]);
        }
        return Promise.resolve([]);
      }),
      users: {
        findUnique: jest.fn().mockResolvedValue(user),
      },
      instruments: {
        findUnique: jest.fn().mockResolvedValue(instrument),
      },
      orders: {
        create: jest.fn().mockImplementation(({ data }) => {
          const order = { id: 100, ...data, price: data.price };
          createdOrders.push(order);
          return Promise.resolve(order);
        }),
      },
      _createdOrders: createdOrders,
    };
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn(),
            orders: {
              findUnique: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('createOrder', () => {
    it('should create a FILLED order for MARKET BUY with sufficient funds', async () => {
      const mockTx = createMockTx({ availableCash: 100000, marketClose: 925 });
      (prisma.$transaction as jest.Mock).mockImplementation((cb) =>
        cb(mockTx),
      );

      const result = await service.createOrder({
        userId: 1,
        instrumentId: 47,
        side: OrderSide.BUY,
        type: OrderType.MARKET,
        quantity: 5,
      });

      expect(result.status).toBe('FILLED');
      expect(result.price).toBe(925);
      expect(result.size).toBe(5);
      expect(result.side).toBe('BUY');
      expect(result.type).toBe('MARKET');
    });

    it('should create a FILLED order for MARKET SELL with sufficient shares', async () => {
      const mockTx = createMockTx({ sharesOwned: 50 });

      let queryRawCallIndex = 0;
      mockTx.$queryRaw = jest.fn().mockImplementation(() => {
        const idx = queryRawCallIndex++;
        if (idx === 0) return Promise.resolve([{ pg_advisory_xact_lock: '' }]);
        if (idx === 1) return Promise.resolve([{ close: 925.85 }]);
        if (idx === 2) return Promise.resolve([{ shares_owned: 50 }]);
        return Promise.resolve([]);
      });

      (prisma.$transaction as jest.Mock).mockImplementation((cb) =>
        cb(mockTx),
      );

      const result = await service.createOrder({
        userId: 1,
        instrumentId: 47,
        side: OrderSide.SELL,
        type: OrderType.MARKET,
        quantity: 10,
      });

      expect(result.status).toBe('FILLED');
      expect(result.size).toBe(10);
      expect(result.side).toBe('SELL');
    });

    it('should create a NEW order for LIMIT BUY', async () => {
      const mockTx = createMockTx({ availableCash: 100000 });

      let queryRawCallIndex = 0;
      mockTx.$queryRaw = jest.fn().mockImplementation(() => {
        const idx = queryRawCallIndex++;
        if (idx === 0) return Promise.resolve([{ pg_advisory_xact_lock: '' }]);
        if (idx === 1) return Promise.resolve([{ available_cash: 100000 }]);
        return Promise.resolve([]);
      });

      (prisma.$transaction as jest.Mock).mockImplementation((cb) =>
        cb(mockTx),
      );

      const result = await service.createOrder({
        userId: 1,
        instrumentId: 47,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: 10,
        price: 900,
      });

      expect(result.status).toBe('NEW');
      expect(result.type).toBe('LIMIT');
      expect(result.price).toBe(900);
    });

    it('should REJECT a BUY order when user has insufficient funds', async () => {
      const mockTx = createMockTx({ availableCash: 100, marketClose: 925 });
      (prisma.$transaction as jest.Mock).mockImplementation((cb) =>
        cb(mockTx),
      );

      const result = await service.createOrder({
        userId: 1,
        instrumentId: 47,
        side: OrderSide.BUY,
        type: OrderType.MARKET,
        quantity: 5,
      });

      expect(result.status).toBe('REJECTED');
    });

    it('should REJECT a SELL order when user has insufficient shares', async () => {
      const mockTx = createMockTx({});

      let queryRawCallIndex = 0;
      mockTx.$queryRaw = jest.fn().mockImplementation(() => {
        const idx = queryRawCallIndex++;
        if (idx === 0) return Promise.resolve([{ pg_advisory_xact_lock: '' }]);
        if (idx === 1) return Promise.resolve([{ close: 925.85 }]);
        if (idx === 2) return Promise.resolve([{ shares_owned: 2 }]);
        return Promise.resolve([]);
      });

      (prisma.$transaction as jest.Mock).mockImplementation((cb) =>
        cb(mockTx),
      );

      const result = await service.createOrder({
        userId: 1,
        instrumentId: 47,
        side: OrderSide.SELL,
        type: OrderType.MARKET,
        quantity: 100,
      });

      expect(result.status).toBe('REJECTED');
    });

    it('should calculate quantity from amount (no fractional shares)', async () => {
      const mockTx = createMockTx({
        availableCash: 50000,
        marketClose: 925.85,
      });
      (prisma.$transaction as jest.Mock).mockImplementation((cb) =>
        cb(mockTx),
      );

      const result = await service.createOrder({
        userId: 1,
        instrumentId: 47,
        side: OrderSide.BUY,
        type: OrderType.MARKET,
        amount: 10000,
      });

      expect(result.size).toBe(Math.floor(10000 / 925.85));
      expect(result.size).toBe(10);
      expect(result.status).toBe('FILLED');
    });

    it('should throw when neither quantity nor amount is provided', async () => {
      await expect(
        service.createOrder({
          userId: 1,
          instrumentId: 47,
          side: OrderSide.BUY,
          type: OrderType.MARKET,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when both quantity and amount are provided', async () => {
      await expect(
        service.createOrder({
          userId: 1,
          instrumentId: 47,
          side: OrderSide.BUY,
          type: OrderType.MARKET,
          quantity: 10,
          amount: 10000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when user does not exist', async () => {
      const mockTx = createMockTx({ user: null });
      (prisma.$transaction as jest.Mock).mockImplementation((cb) =>
        cb(mockTx),
      );

      await expect(
        service.createOrder({
          userId: 999,
          instrumentId: 47,
          side: OrderSide.BUY,
          type: OrderType.MARKET,
          quantity: 5,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw when instrument does not exist', async () => {
      const mockTx = createMockTx({ instrument: null });
      (prisma.$transaction as jest.Mock).mockImplementation((cb) =>
        cb(mockTx),
      );

      await expect(
        service.createOrder({
          userId: 1,
          instrumentId: 999,
          side: OrderSide.BUY,
          type: OrderType.MARKET,
          quantity: 5,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw when no market data is available for MARKET order', async () => {
      const mockTx = createMockTx({});

      let queryRawCallIndex = 0;
      mockTx.$queryRaw = jest.fn().mockImplementation(() => {
        const idx = queryRawCallIndex++;
        if (idx === 0) return Promise.resolve([{ pg_advisory_xact_lock: '' }]);
        if (idx === 1) return Promise.resolve([]);
        return Promise.resolve([]);
      });

      (prisma.$transaction as jest.Mock).mockImplementation((cb) =>
        cb(mockTx),
      );

      await expect(
        service.createOrder({
          userId: 1,
          instrumentId: 47,
          side: OrderSide.BUY,
          type: OrderType.MARKET,
          quantity: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when LIMIT order has no price', async () => {
      const mockTx = createMockTx({});
      (prisma.$transaction as jest.Mock).mockImplementation((cb) =>
        cb(mockTx),
      );

      await expect(
        service.createOrder({
          userId: 1,
          instrumentId: 47,
          side: OrderSide.BUY,
          type: OrderType.LIMIT,
          quantity: 10,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when amount is too low to buy any shares', async () => {
      const mockTx = createMockTx({ marketClose: 1000 });
      (prisma.$transaction as jest.Mock).mockImplementation((cb) =>
        cb(mockTx),
      );

      await expect(
        service.createOrder({
          userId: 1,
          instrumentId: 47,
          side: OrderSide.BUY,
          type: OrderType.MARKET,
          amount: 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject trading MONEDA instruments', async () => {
      const mockTx = createMockTx({
        instrument: { id: 66, ticker: 'ARS', name: 'PESOS', type: 'MONEDA' },
      });
      (prisma.$transaction as jest.Mock).mockImplementation((cb) =>
        cb(mockTx),
      );

      await expect(
        service.createOrder({
          userId: 1,
          instrumentId: 66,
          side: OrderSide.BUY,
          type: OrderType.MARKET,
          quantity: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelOrder', () => {
    it('should cancel an order with status NEW', async () => {
      (prisma.orders.findUnique as jest.Mock).mockResolvedValue({
        id: 5,
        status: 'NEW',
      });
      (prisma.orders.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });

      const result = await service.cancelOrder(5);

      expect(result.status).toBe('CANCELLED');
      expect(prisma.orders.updateMany).toHaveBeenCalledWith({
        where: { id: 5, status: 'NEW' },
        data: { status: 'CANCELLED' },
      });
    });

    it('should throw when order does not exist', async () => {
      (prisma.orders.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.cancelOrder(999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw when order status is not NEW', async () => {
      (prisma.orders.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        status: 'FILLED',
      });
      (prisma.orders.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      });

      await expect(service.cancelOrder(1)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
