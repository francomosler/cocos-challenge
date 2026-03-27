import { Test, TestingModule } from '@nestjs/testing';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';

describe('PortfolioController', () => {
  let controller: PortfolioController;
  let service: PortfolioService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PortfolioController],
      providers: [
        {
          provide: PortfolioService,
          useValue: { getPortfolio: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<PortfolioController>(PortfolioController);
    service = module.get<PortfolioService>(PortfolioService);
  });

  it('should delegate to service with the userId', async () => {
    const mockPortfolio = {
      totalAccountValue: 100000,
      availableCash: 50000,
      positions: [],
    };
    (service.getPortfolio as jest.Mock).mockResolvedValue(mockPortfolio);

    const result = await controller.getPortfolio(1);

    expect(service.getPortfolio).toHaveBeenCalledWith(1);
    expect(result).toEqual(mockPortfolio);
  });
});
