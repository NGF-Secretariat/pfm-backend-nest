import { Test, TestingModule } from '@nestjs/testing';
import { LandingPageService } from './landing-page.service';

describe('LandingPageService', () => {
  let service: LandingPageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LandingPageService],
    }).compile();

    service = module.get<LandingPageService>(LandingPageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
