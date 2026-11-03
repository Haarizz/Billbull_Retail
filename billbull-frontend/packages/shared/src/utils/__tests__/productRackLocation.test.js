import { describe, expect, it } from 'vitest';
import { getProductRackLocation } from '../productRackLocation';

describe('getProductRackLocation', () => {
  it('reads the flat /api/products/list fields', () => {
    expect(getProductRackLocation({ zoneName: 'Zone A', locatorName: 'Rack 3' }))
      .toEqual({ zone: 'Zone A', locator: 'Rack 3' });
  });

  it('reads a product aggregate inventory policy', () => {
    const aggregate = { inventory: { zone: { name: 'Cold' }, locator: { name: 'C-01' } } };
    expect(getProductRackLocation(aggregate)).toEqual({ zone: 'Cold', locator: 'C-01' });
  });

  it('returns empty strings when nothing is set', () => {
    expect(getProductRackLocation(null)).toEqual({ zone: '', locator: '' });
    expect(getProductRackLocation({ inventory: { zone: null } })).toEqual({ zone: '', locator: '' });
  });
});
