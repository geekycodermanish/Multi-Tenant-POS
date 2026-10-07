import { NotFoundException } from '@nestjs/common';
import { Merchant, User } from '../../database/entities';
import { MerchantsService } from './merchants.service';

describe('MerchantsService', () => {
  const merchantA = { id: 'merchant-a', name: 'A', isActive: true };
  const merchantB = { id: 'merchant-b', name: 'B', isActive: true };
  let merchantModel: { findAll: jest.Mock; findOne: jest.Mock };
  let service: MerchantsService;

  beforeEach(() => {
    merchantModel = {
      findAll: jest.fn().mockResolvedValue([merchantA]),
      findOne: jest.fn().mockResolvedValue(merchantA),
    };
    service = new MerchantsService(merchantModel as unknown as typeof Merchant);
  });

  it('returns only the caller merchant', async () => {
    merchantModel.findAll.mockResolvedValueOnce([merchantA]);
    const scopedService = service as unknown as {
      findAll(user: User): Promise<Merchant[]>;
    };

    await expect(scopedService.findAll({ merchantId: merchantA.id } as User)).resolves.toEqual([merchantA]);
    expect(merchantModel.findAll).toHaveBeenCalledWith({
      where: { id: merchantA.id, isActive: true },
    });
  });

  it('returns NotFoundException for another merchant id', async () => {
    const scopedService = service as unknown as {
      findOne(id: string, user: User): Promise<Merchant>;
    };

    await expect(
      scopedService.findOne(merchantB.id, { merchantId: merchantA.id } as User),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(merchantModel.findOne).not.toHaveBeenCalled();
  });
});
