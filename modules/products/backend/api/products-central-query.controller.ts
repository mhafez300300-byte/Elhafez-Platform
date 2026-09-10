import { Controller, Get, Headers, Param, Query } from '@nestjs/common';
import { ValidationError } from '@elhafez/errors';
import { RequirePermission } from '@elhafez/platform-contracts';
import { parseWithSchema } from '@elhafez/validation';
import { z } from 'zod';
import { ProductsCentralQueryService } from '../application/products-central-query.service';

const uuid = z.string().uuid();
const boolText = z.enum(['true', 'false']);
const intText = z.string().regex(/^\d+$/);

@Controller('products/central-v1')
export class ProductsCentralQueryController {
  constructor(private readonly service: ProductsCentralQueryService) {}

  @Get()
  @RequirePermission('products.central-catalog.view')
  search(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('manufacturer') manufacturer?: string,
    @Query('dosageForm') dosageForm?: string,
    @Query('strength') strength?: string,
    @Query('controlled') controlled?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const parsed = parseWithSchema(z.object({
      search: z.string().max(220).optional(),
      status: z.enum(['ACTIVE', 'SUPERSEDED', 'RETIRED', 'QUARANTINED']).optional(),
      manufacturer: z.string().max(200).optional(),
      dosageForm: z.string().max(120).optional(),
      strength: z.string().max(40).optional(),
      controlled: boolText.optional(),
      page: intText.optional(),
      pageSize: intText.optional(),
    }), compact({ search, status, manufacturer, dosageForm, strength, controlled, page, pageSize }));
    return this.service.search({
      search: parsed.search,
      status: parsed.status,
      manufacturer: parsed.manufacturer,
      dosageForm: parsed.dosageForm,
      strength: parsed.strength,
      controlled: parsed.controlled === undefined ? undefined : parsed.controlled === 'true',
      page: integer(parsed.page, 1, 1, 1_000_000),
      pageSize: integer(parsed.pageSize, 25, 1, 100),
    });
  }

  @Get('company-link/:id')
  @RequirePermission('products.central-catalog.view')
  companyLink(@Headers('x-company-id') companyId: string | undefined, @Param('id') id: string) {
    return this.service.getCompanyLink(parseWithSchema(uuid, companyId), parseWithSchema(uuid, id));
  }

  @Get(':id')
  @RequirePermission('products.central-catalog.view')
  get(@Param('id') id: string) {
    return this.service.getDetail(parseWithSchema(uuid, id));
  }
}

function compact(input: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== ''));
}

function integer(value: string | undefined, fallback: number, min: number, max: number) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new ValidationError('Invalid pagination query');
  return parsed;
}
