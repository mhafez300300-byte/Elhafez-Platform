import { Controller, Get, Headers, Inject, Param, Query } from '@nestjs/common';
import { AUDIT_READER, type AuditReader } from '@elhafez/audit/contracts';
import { RequirePermission } from '@elhafez/platform-contracts';
import { parseWithSchema } from '@elhafez/validation';
import { z } from 'zod';
import { ProductsService } from '../application/products.service';

const uuid = z.string().uuid();
const pageNumber = z.coerce.number().int().min(1);

@Controller('products')
export class ProductsAuditController {
  constructor(
    private readonly products: ProductsService,
    @Inject(AUDIT_READER) private readonly audit: AuditReader,
  ) {}

  @Get(':id/audit')
  @RequirePermission('products.view-audit')
  async history(
    @Param('id') id: string,
    @Headers('x-company-id') companyId: string | undefined,
    @Headers('x-branch-id') branchId: string | undefined,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const trustedCompanyId = parseWithSchema(uuid, companyId);
    const productId = parseWithSchema(uuid, id);
    const trustedBranchId = branchId ? parseWithSchema(uuid, branchId) : undefined;

    // PermissionGuard authorizes the requested company/branch scope before this
    // controller runs. Re-resolving the product prevents cross-company probing,
    // and AuditReader re-applies the same scope as defense in depth.
    await this.products.get(trustedCompanyId, productId);

    return this.audit.getEntityHistory(
      {
        entityType: 'product',
        entityId: productId,
        ...(page ? { page: parseWithSchema(pageNumber, page) } : {}),
        ...(pageSize ? { pageSize: parseWithSchema(pageNumber, pageSize) } : {}),
      },
      {
        companyId: trustedCompanyId,
        ...(trustedBranchId ? { branchId: trustedBranchId } : {}),
      },
    );
  }
}
