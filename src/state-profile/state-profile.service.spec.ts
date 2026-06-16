import { Test, TestingModule } from '@nestjs/testing';
import { StateProfileService } from './state-profile.service';

describe('StateProfileService', () => {
  let service: StateProfileService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StateProfileService],
    }).compile();

    service = module.get<StateProfileService>(StateProfileService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
