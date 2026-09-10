import { describe, expect, it, vi } from 'vitest';
import type { AuditReader } from '@elhafez/audit/contracts';
import { ProductsAuditController } from '../backend/api/products-audit.controller';
import type { ProductsService } from '../backend/application/products.service';

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';

describe('Products audit collaboration', () => {
  it('validates company ownership before reading entity history and passes the authorized branch scope', async () => {
    const get = vi.fn().mockResolvedValue({ id: PRODUCT_ID, companyId: COMPANY_ID });
    const getEntityHistory = vi.fn().mockResolvedValue({ items: [], page: 2, pageSize: 100, total: 0 });
    const controller = new ProductsAuditController(
      { get } as unknown as ProductsService,
      { getEntityHistory } as AuditReader,
    );

    const result = await controller.history(PRODUCT_ID, COMPANY_ID, BRANCH_ID, '2', '250');

    expect(get).toHaveBeenCalledWith(COMPANY_ID, PRODUCT_ID);
    expect(getEntityHistory).toHaveBeenCalledWith(
      { entityType: 'product', entityId: PRODUCT_ID, page: 2, pageSize: 250 },
      { companyId: COMPANY_ID, branchId: BRANCH_ID },
    );
    expect(result.pageSize).toBe(100);
  });

  it('never calls Audit Reader when the product is not visible in the requested company scope', async () => {
    const get = vi.fn().mockRejectedValue(new Error('Product not found in authorized company'));
    const getEntityHistory = vi.fn();
    const controller = new ProductsAuditController(
      { get } as unknown as ProductsService,
      { getEntityHistory } as AuditReader,
    );

    await expect(controller.history(PRODUCT_ID, COMPANY_ID, undefined)).rejects.toThrow('Product not found');
    expect(getEntityHistory).not.toHaveBeenCalled();
  });
});
