import { Test, TestingModule } from '@nestjs/testing';
import { StateProfileController } from './state-profile.controller';

describe('StateProfileController', () => {
  let controller: StateProfileController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StateProfileController],
    }).compile();

    controller = module.get<StateProfileController>(StateProfileController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
