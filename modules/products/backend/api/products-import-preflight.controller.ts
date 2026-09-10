import { Body, Controller, Headers, Inject, Post, Req } from '@nestjs/common';
import { AuthorizationError } from '@elhafez/errors';
import { PERMISSION_CHECKER, type PermissionChecker } from '@elhafez/permissions/contracts';
import { RequirePermission, type AccessPrincipal } from '@elhafez/platform-contracts';
import { parseWithSchema } from '@elhafez/validation';
import { z } from 'zod';
import type { CentralImportRow, CompanyImportRow } from '../application/products.repository';
import { ProductsImportPreflightService } from '../application/products-import-preflight.service';

const uuid = z.string().uuid();
const ingredient = z.object({ name: z.string().min(1).max(180), strengthValue: z.string().max(40).nullable().optional(), strengthUnit: z.string().max(40).nullable().optional() });
const companyRow = z.object({
  row: z.number().int().min(1),
  displayName: z.string().min(1).max(200),
  productType: z.enum(['DRUG', 'NON_DRUG']),
  productCode: z.string().max(32).nullable().optional(),
  arabicName: z.string().max(200).nullable().optional(),
  englishName: z.string().max(200).nullable().optional(),
  tradeName: z.string().max(200).nullable().optional(),
  manufacturerName: z.string().max(180).nullable().optional(),
  categoryName: z.string().max(120).nullable().optional(),
  ingredientName: z.string().max(180).nullable().optional(),
  strengthValue: z.string().max(40).nullable().optional(),
  strengthUnit: z.string().max(40).nullable().optional(),
  ingredients: z.array(ingredient).max(30).optional(),
  dosageFormName: z.string().max(120).nullable().optional(),
  routeName: z.string().max(120).nullable().optional(),
  barcode: z.string().max(64).nullable().optional(),
  barcodeSymbology: z.string().max(30).nullable().optional(),
  baseUnitName: z.string().max(120).nullable().optional(),
  packageUnitName: z.string().max(120).nullable().optional(),
  packageFactor: z.string().max(40).nullable().optional(),
  regulatoryId: z.string().max(120).nullable().optional(),
  atcCode: z.string().max(40).nullable().optional(),
  prescriptionClass: z.string().max(40).nullable().optional(),
  controlled: z.boolean().optional(),
  coldChain: z.boolean().optional(),
  referencePrice: z.string().max(40).nullable().optional(),
  referencePriceSource: z.string().max(300).nullable().optional(),
  marketStatus: z.enum(['AVAILABLE', 'DISCONTINUED', 'UNKNOWN']).optional(),
  notes: z.string().max(4000).nullable().optional(),
});
const centralRow = z.object({
  row: z.number().int().min(1),
  sourceRecordKey: z.string().min(1).max(180),
  canonicalName: z.string().min(1).max(220),
  arabicName: z.string().max(220).nullable().optional(),
  englishName: z.string().max(220).nullable().optional(),
  tradeName: z.string().max(220).nullable().optional(),
  manufacturerName: z.string().max(200).nullable().optional(),
  ingredientName: z.string().max(180).nullable().optional(),
  strengthValue: z.string().max(40).nullable().optional(),
  strengthUnit: z.string().max(40).nullable().optional(),
  ingredients: z.array(ingredient).max(30).optional(),
  dosageForm: z.string().max(120).nullable().optional(),
  route: z.string().max(120).nullable().optional(),
  regulatoryId: z.string().max(120).nullable().optional(),
  atcCode: z.string().max(40).nullable().optional(),
  prescriptionClass: z.string().max(40).nullable().optional(),
  controlled: z.boolean().optional(),
  packageDescription: z.string().max(300).nullable().optional(),
  baseUnitLabel: z.string().max(80).nullable().optional(),
  packageUnitLabel: z.string().max(80).nullable().optional(),
  conversionFactor: z.string().max(40).nullable().optional(),
  barcode: z.string().max(64).nullable().optional(),
  barcodeSymbology: z.string().max(30).nullable().optional(),
  referencePrice: z.string().max(40).nullable().optional(),
  marketStatus: z.enum(['AVAILABLE', 'DISCONTINUED', 'UNKNOWN']).optional(),
}).passthrough();

type AuthRequest = { user: AccessPrincipal };

@Controller('products/import-preflight-v1')
export class ProductsImportPreflightController {
  constructor(
    private readonly service: ProductsImportPreflightService,
    @Inject(PERMISSION_CHECKER) private readonly permissionChecker: PermissionChecker,
  ) {}

  @Post('company')
  @RequirePermission('products.import')
  company(@Headers('x-company-id') companyId: string | undefined, @Body() body: unknown) {
    const input = parseWithSchema(z.object({ mode: z.enum(['CREATE_ONLY', 'UPSERT_PRODUCT_CODE', 'UPSERT_BARCODE']), rows: z.array(companyRow).min(1).max(500) }), body);
    return this.service.company(parseWithSchema(uuid, companyId), input.mode, input.rows as CompanyImportRow[]);
  }

  @Post('central')
  @RequirePermission('products.central-catalog.manage')
  async central(@Body() body: unknown, @Req() request: AuthRequest) {
    await this.globalManage(request.user);
    const input = parseWithSchema(z.object({ sourceId: uuid, rows: z.array(centralRow).min(1).max(500) }), body);
    return this.service.central(input.sourceId, input.rows as unknown as CentralImportRow[]);
  }

  private async globalManage(user: AccessPrincipal) {
    if (user.platformAdmin) return;
    if (!(await this.permissionChecker.hasPermission(user.userId, 'products.central-catalog.manage', {}))) {
      throw new AuthorizationError('Central catalog management requires GLOBAL permission');
    }
  }
}
