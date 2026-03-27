import { Test, TestingModule } from '@nestjs/testing';
import { InstrumentsController } from './instruments.controller';
import { InstrumentsService } from './instruments.service';

describe('InstrumentsController', () => {
  let controller: InstrumentsController;
  let service: InstrumentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InstrumentsController],
      providers: [
        {
          provide: InstrumentsService,
          useValue: { search: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<InstrumentsController>(InstrumentsController);
    service = module.get<InstrumentsService>(InstrumentsService);
  });

  it('should return empty array when query is empty', () => {
    expect(controller.search('')).toEqual([]);
    expect(service.search).not.toHaveBeenCalled();
  });

  it('should return empty array when query is undefined', () => {
    expect(controller.search(undefined as any)).toEqual([]);
    expect(service.search).not.toHaveBeenCalled();
  });

  it('should return empty array when query is only whitespace', () => {
    expect(controller.search('   ')).toEqual([]);
    expect(service.search).not.toHaveBeenCalled();
  });

  it('should delegate to service with trimmed query', async () => {
    const mockResults = [{ id: 1, ticker: 'PAMP' }];
    (service.search as jest.Mock).mockResolvedValue(mockResults);

    const result = await controller.search('  PAMP  ');

    expect(service.search).toHaveBeenCalledWith('PAMP');
    expect(result).toEqual(mockResults);
  });
});
