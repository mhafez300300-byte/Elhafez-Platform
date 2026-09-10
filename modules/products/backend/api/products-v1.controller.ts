import { Body, Controller, Get, Headers, Inject, Patch, Post, Query, Req, Param } from '@nestjs/common';
import { AuthorizationError, ValidationError } from '@elhafez/errors';
import { PERMISSION_CHECKER, type PermissionChecker } from '@elhafez/permissions/contracts';
import { RequirePermission, type AccessPrincipal } from '@elhafez/platform-contracts';
import { parseWithSchema } from '@elhafez/validation';
import { z } from 'zod';
import type { ProductListQuery } from '../application/products.repository';
import { ProductsV1Service, type BulkProductPatch } from '../application/products-v1.service';

const uuid = z.string().uuid();
const boolText = z.enum(['true', 'false']);
const intText = z.string().regex(/^\d+$/);
const dateText = z.string().datetime({ offset: true });
const status = z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED']);
const market = z.enum(['AVAILABLE', 'DISCONTINUED', 'UNKNOWN']);
const sortBy = z.enum(['NAME', 'PRODUCT_CODE', 'UPDATED_AT', 'CREATED_AT', 'MANUFACTURER', 'CATEGORY']);
const sortDirection = z.enum(['asc', 'desc']);

const querySchema = z.object({
  search: z.string().max(220).optional(),
  status: status.optional(),
  productType: z.enum(['DRUG', 'NON_DRUG']).optional(),
  categoryId: uuid.optional(),
  tagId: uuid.optional(),
  manufacturerId: uuid.optional(),
  ingredientId: uuid.optional(),
  dosageFormId: uuid.optional(),
  prescriptionClass: z.string().max(40).optional(),
  marketStatus: market.optional(),
  controlled: boolText.optional(),
  hasBarcode: boolText.optional(),
  hasImage: boolText.optional(),
  linkedCentral: boolText.optional(),
  createdFrom: dateText.optional(),
  createdTo: dateText.optional(),
  updatedFrom: dateText.optional(),
  updatedTo: dateText.optional(),
  sortBy: sortBy.optional(),
  sortDirection: sortDirection.optional(),
  page: intText.optional(),
  pageSize: intText.optional(),
});

const bulkPatchSchema = z.object({
  categoryId: uuid.nullable().optional(),
  manufacturerId: uuid.nullable().optional(),
  tagIds: z.array(uuid).max(100).optional(),
  status: status.optional(),
  prescriptionClass: z.string().max(40).nullable().optional(),
  marketStatus: market.optional(),
  controlled: z.boolean().optional(),
  coldChain: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'Select at least one field for bulk update' });
const bulkSchema = z.object({ productIds: z.array(uuid).min(1).max(5000), patch: bulkPatchSchema });
const governanceSchema = z.object({
  version: z.number().int().min(1),
  status: z.enum(['ACTIVE', 'SUPERSEDED', 'RETIRED']),
  resolutionNote: z.string().min(3).max(2000),
});

type AuthRequest = { user: AccessPrincipal };

@Controller('products')
export class ProductsV1Controller {
  constructor(
    private readonly service: ProductsV1Service,
    @Inject(PERMISSION_CHECKER) private readonly permissionChecker: PermissionChecker,
  ) {}

  @Get('query-v1')
  @RequirePermission('products.view')
  list(@Headers('x-company-id') companyId: string | undefined, @Query() raw: Record<string, unknown>) {
    return this.service.list(this.query(companyId, raw));
  }

  @Get('export-v1')
  @RequirePermission('products.export')
  export(
    @Headers('x-company-id') companyId: string | undefined,
    @Query('format') format: string | undefined,
    @Query() raw: Record<string, unknown>,
  ) {
    const query = this.query(companyId, { ...raw, page: '1', pageSize: '100' });
    const { page: _page, pageSize: _pageSize, ...filters } = query;
    return format === 'xlsx' ? this.service.exportTable(filters) : this.service.exportCsv(filters);
  }

  @Post('bulk-v1/preview')
  @RequirePermission('products.bulk-update')
  bulkPreview(@Headers('x-company-id') companyId: string | undefined, @Body() body: unknown) {
    const input = parseWithSchema(bulkSchema, body);
    return this.service.previewBulkV1(this.company(companyId), input.productIds, input.patch as BulkProductPatch);
  }

  @Post('bulk-v1')
  @RequirePermission('products.bulk-update')
  bulk(
    @Headers('x-company-id') companyId: string | undefined,
    @Headers('x-branch-id') branchId: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthRequest,
  ) {
    const input = parseWithSchema(bulkSchema, body);
    return this.service.bulkUpdate(
      input.productIds,
      input.patch as BulkProductPatch,
      this.idempotency(idempotencyKey),
      this.context(companyId, branchId, requestId, request.user),
    );
  }

  @Get('import/sessions')
  @RequirePermission('products.import')
  companyImportHistory(
    @Headers('x-company-id') companyId: string | undefined,
    @Query('limit') limit?: string,
  ) {
    return this.service.listCompanyImportSessions(this.company(companyId), this.integer(limit, 25, 1, 100));
  }

  @Get('central-admin/datasets')
  @RequirePermission('products.central-catalog.manage')
  async datasets(@Req() request: AuthRequest, @Query('limit') limit?: string) {
    await this.globalManage(request.user);
    return this.service.listCentralDatasets(this.integer(limit, 25, 1, 100));
  }

  @Get('central-admin/import-sessions')
  @RequirePermission('products.central-catalog.manage')
  async centralImportHistory(@Req() request: AuthRequest, @Query('limit') limit?: string) {
    await this.globalManage(request.user);
    return this.service.listCentralImportSessions(this.integer(limit, 25, 1, 100));
  }

  @Get('central-admin/references/:id')
  @RequirePermission('products.central-catalog.manage')
  async centralAdmin(@Param('id') id: string, @Req() request: AuthRequest) {
    await this.globalManage(request.user);
    return this.service.getCentralAdmin(parseWithSchema(uuid, id));
  }

  @Patch('central-admin/references/:id/govern')
  @RequirePermission('products.central-catalog.manage')
  async govern(
    @Param('id') id: string,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthRequest,
  ) {
    await this.globalManage(request.user);
    const input = parseWithSchema(governanceSchema, body);
    return this.service.governCentralReference(parseWithSchema(uuid, id), input, {
      actorId: request.user.userId,
      requestId: this.requestId(requestId),
    });
  }

  private query(companyId: string | undefined, raw: Record<string, unknown>): ProductListQuery {
    const compact = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== '' && value !== undefined));
    const parsed = parseWithSchema(querySchema, compact);
    const createdFrom = parsed.createdFrom ? new Date(parsed.createdFrom) : undefined;
    const createdTo = parsed.createdTo ? new Date(parsed.createdTo) : undefined;
    const updatedFrom = parsed.updatedFrom ? new Date(parsed.updatedFrom) : undefined;
    const updatedTo = parsed.updatedTo ? new Date(parsed.updatedTo) : undefined;
    if (createdFrom && createdTo && createdFrom > createdTo) throw new ValidationError('createdFrom must not be after createdTo');
    if (updatedFrom && updatedTo && updatedFrom > updatedTo) throw new ValidationError('updatedFrom must not be after updatedTo');
    return {
      companyId: this.company(companyId),
      search: parsed.search,
      status: parsed.status,
      productType: parsed.productType,
      categoryId: parsed.categoryId,
      tagId: parsed.tagId,
      manufacturerId: parsed.manufacturerId,
      ingredientId: parsed.ingredientId,
      dosageFormId: parsed.dosageFormId,
      prescriptionClass: parsed.prescriptionClass,
      marketStatus: parsed.marketStatus,
      controlled: this.boolean(parsed.controlled),
      hasBarcode: this.boolean(parsed.hasBarcode),
      hasImage: this.boolean(parsed.hasImage),
      linkedCentral: this.boolean(parsed.linkedCentral),
      createdFrom,
      createdTo,
      updatedFrom,
      updatedTo,
      sortBy: parsed.sortBy,
      sortDirection: parsed.sortDirection,
      page: this.integer(parsed.page, 1, 1, 1_000_000),
      pageSize: this.integer(parsed.pageSize, 25, 1, 100),
    };
  }

  private boolean(value: 'true' | 'false' | undefined) {
    return value === undefined ? undefined : value === 'true';
  }

  private integer(value: string | undefined, fallback: number, min: number, max: number) {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new ValidationError('Invalid numeric query');
    return parsed;
  }

  private company(value: string | undefined) {
    return parseWithSchema(uuid, value);
  }

  private idempotency(value: string | undefined) {
    return parseWithSchema(z.string().min(8).max(120), value);
  }

  private requestId(value: string | undefined) {
    return value?.slice(0, 100);
  }

  private context(companyId: string | undefined, branchId: string | undefined, requestId: string | undefined, user: AccessPrincipal) {
    return {
      companyId: this.company(companyId),
      actorId: user.userId,
      branchId: branchId ? parseWithSchema(uuid, branchId) : undefined,
      requestId: this.requestId(requestId),
    };
  }

  private async globalManage(user: AccessPrincipal) {
    if (user.platformAdmin) return;
    if (!(await this.permissionChecker.hasPermission(user.userId, 'products.central-catalog.manage', {}))) {
      throw new AuthorizationError('Central catalog management requires GLOBAL permission');
    }
  }
}
