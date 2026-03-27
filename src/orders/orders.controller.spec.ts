import { Test, TestingModule } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderSide, OrderType } from './dto/create-order.dto';

describe('OrdersController', () => {
  let controller: OrdersController;
  let service: OrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        {
          provide: OrdersService,
          useValue: {
            createOrder: jest.fn(),
            cancelOrder: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
    service = module.get<OrdersService>(OrdersService);
  });

  it('should delegate createOrder to service', async () => {
    const dto = {
      userId: 1,
      instrumentId: 47,
      side: OrderSide.BUY,
      type: OrderType.MARKET,
      quantity: 5,
    };
    const mockResult = { id: 1, ...dto, status: 'FILLED', price: 925 };
    (service.createOrder as jest.Mock).mockResolvedValue(mockResult);

    const result = await controller.createOrder(dto);

    expect(service.createOrder).toHaveBeenCalledWith(dto);
    expect(result).toEqual(mockResult);
  });

  it('should delegate cancelOrder to service', async () => {
    const mockResult = { id: 5, status: 'CANCELLED' };
    (service.cancelOrder as jest.Mock).mockResolvedValue(mockResult);

    const result = await controller.cancelOrder(5);

    expect(service.cancelOrder).toHaveBeenCalledWith(5);
    expect(result).toEqual(mockResult);
  });
});
