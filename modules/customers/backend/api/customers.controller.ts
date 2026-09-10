import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ValidationError } from '@elhafez/errors';
import { RequirePermission, type AccessPrincipal } from '@elhafez/platform-contracts';
import { parseWithSchema } from '@elhafez/validation';
import { z } from 'zod';
import { CustomersService, type CustomerImportRow, type CustomerMutationContext } from '../application/customers.service';

const optionalText = (max: number) => z.string().max(max).nullable().optional();
const uuid = z.string().uuid();
const addressSchema = z.object({
  label: optionalText(80),
  governorate: optionalText(120),
  city: optionalText(120),
  street: optionalText(180),
  details: optionalText(600),
  landmark: optionalText(180),
  phone: optionalText(40),
  isDefault: z.boolean().optional(),
});
const customerDraftSchema = z.object({
  customerType: z.enum(['INDIVIDUAL','COMPANY']),
  fullName: z.string().min(1).max(180),
  tradeName: optionalText(180),
  primaryPhone: optionalText(40),
  secondaryPhone: optionalText(40),
  whatsappPhone: optionalText(40),
  email: optionalText(254),
  nationalId: optionalText(60),
  taxNumber: optionalText(60),
  commercialRegistration: optionalText(80),
  birthDate: z.string().date().nullable().optional(),
  gender: optionalText(30),
  categoryId: uuid.nullable().optional(),
  source: optionalText(40),
  notes: optionalText(4000),
  tagIds: z.array(uuid).max(50).optional(),
});
const createSchema = customerDraftSchema.extend({ addresses: z.array(addressSchema).max(20).optional() });
const updateSchema = customerDraftSchema.partial().extend({ version: z.number().int().min(1) });
const quickSchema = z.object({
  fullName: z.string().min(1).max(180),
  primaryPhone: optionalText(40),
  customerType: z.enum(['INDIVIDUAL','COMPANY']).optional(),
});
const statusSchema = z.object({ status: z.enum(['ACTIVE','SUSPENDED','ARCHIVED']), version: z.number().int().min(1) });
const addressUpdateSchema = addressSchema.partial().extend({ version: z.number().int().min(1) });
const classificationCreateSchema = z.object({ name: z.string().min(1).max(120) });
const classificationUpdateSchema = z.object({ name: z.string().min(1).max(120), active: z.boolean() });
const importRowSchema = customerDraftSchema.extend({
  addressLabel: optionalText(80),
  governorate: optionalText(120),
  city: optionalText(120),
  street: optionalText(180),
  addressDetails: optionalText(600),
  landmark: optionalText(180),
  addressPhone: optionalText(40),
});
const importSchema = z.object({ rows: z.array(importRowSchema).min(1).max(1000) });

type AuthRequest = { user: AccessPrincipal };

@Controller('customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Get()
  @RequirePermission('customers.view')
  list(
    @Headers('x-company-id') companyId: string | undefined,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('customerType') customerType?: string,
    @Query('categoryId') categoryId?: string,
    @Query('governorate') governorate?: string,
    @Query('city') city?: string,
    @Query('tagIds') tagIds?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const scope = this.company(companyId);
    const parsed = parseWithSchema(z.object({
      search: z.string().max(180).optional(),
      status: z.enum(['ACTIVE','SUSPENDED','ARCHIVED']).optional(),
      customerType: z.enum(['INDIVIDUAL','COMPANY']).optional(),
      categoryId: uuid.optional(),
      governorate: z.string().max(120).optional(),
      city: z.string().max(120).optional(),
      tagIds: z.array(uuid).max(20).optional(),
      createdFrom: z.coerce.date().optional(),
      createdTo: z.coerce.date().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
    }), {
      search,
      status: status || undefined,
      customerType: customerType || undefined,
      categoryId: categoryId || undefined,
      governorate: governorate || undefined,
      city: city || undefined,
      tagIds: tagIds ? tagIds.split(',').filter(Boolean) : undefined,
      createdFrom: createdFrom || undefined,
      createdTo: createdTo || undefined,
      page: page ?? 1,
      pageSize: pageSize ?? 25,
    });
    this.assertDateRange(parsed.createdFrom, parsed.createdTo);
    return this.service.list({
      companyId: scope,
      ...parsed,
      page: parsed.page ?? 1,
      pageSize: parsed.pageSize ?? 25,
    });
  }

  @Get('categories')
  @RequirePermission('customers.view')
  categories(@Headers('x-company-id') companyId: string | undefined, @Query('includeInactive') includeInactive?: string) {
    return this.service.listCategories(this.company(companyId), includeInactive === 'true');
  }

  @Post('categories')
  @RequirePermission('customers.update')
  createCategory(
    @Headers('x-company-id') companyId: string | undefined,
    @Headers('x-branch-id') branchId: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const input = parseWithSchema(classificationCreateSchema, body);
    return this.service.createCategory(input.name, this.context(companyId, branchId, requestId, req.user));
  }

  @Patch('categories/:id')
  @RequirePermission('customers.update')
  updateCategory(
    @Param('id') id: string,
    @Headers('x-company-id') companyId: string | undefined,
    @Headers('x-branch-id') branchId: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const input = parseWithSchema(classificationUpdateSchema, body);
    return this.service.updateCategory(parseWithSchema(uuid, id), input.name, input.active, this.context(companyId, branchId, requestId, req.user));
  }

  @Get('tags')
  @RequirePermission('customers.view')
  tags(@Headers('x-company-id') companyId: string | undefined, @Query('includeInactive') includeInactive?: string) {
    return this.service.listTags(this.company(companyId), includeInactive === 'true');
  }

  @Post('tags')
  @RequirePermission('customers.update')
  createTag(
    @Headers('x-company-id') companyId: string | undefined,
    @Headers('x-branch-id') branchId: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const input = parseWithSchema(classificationCreateSchema, body);
    return this.service.createTag(input.name, this.context(companyId, branchId, requestId, req.user));
  }

  @Patch('tags/:id')
  @RequirePermission('customers.update')
  updateTag(
    @Param('id') id: string,
    @Headers('x-company-id') companyId: string | undefined,
    @Headers('x-branch-id') branchId: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const input = parseWithSchema(classificationUpdateSchema, body);
    return this.service.updateTag(parseWithSchema(uuid, id), input.name, input.active, this.context(companyId, branchId, requestId, req.user));
  }

  @Post('duplicates')
  @RequirePermission('customers.view')
  duplicates(@Headers('x-company-id') companyId: string | undefined, @Body() body: unknown) {
    return this.service.findLikelyDuplicates(this.company(companyId), parseWithSchema(customerDraftSchema, body));
  }

  @Post('quick')
  @RequirePermission('customers.create')
  quick(
    @Headers('x-company-id') companyId: string | undefined,
    @Headers('x-branch-id') branchId: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.service.quickAdd(
      parseWithSchema(quickSchema, body),
      this.idempotency(idempotencyKey),
      this.context(companyId, branchId, requestId, req.user),
    );
  }

  @Post('import')
  @RequirePermission('customers.import')
  importCustomers(
    @Headers('x-company-id') companyId: string | undefined,
    @Headers('x-branch-id') branchId: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const input = parseWithSchema(importSchema, body);
    return this.service.import(
      input.rows as CustomerImportRow[],
      this.idempotency(idempotencyKey),
      this.context(companyId, branchId, requestId, req.user),
    );
  }

  @Get('export')
  @RequirePermission('customers.export')
  exportCustomers(
    @Headers('x-company-id') companyId: string | undefined,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('customerType') customerType?: string,
    @Query('categoryId') categoryId?: string,
    @Query('governorate') governorate?: string,
    @Query('city') city?: string,
    @Query('tagIds') tagIds?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
  ) {
    const parsed = parseWithSchema(z.object({
      search: z.string().max(180).optional(),
      status: z.enum(['ACTIVE','SUSPENDED','ARCHIVED']).optional(),
      customerType: z.enum(['INDIVIDUAL','COMPANY']).optional(),
      categoryId: uuid.optional(),
      governorate: z.string().max(120).optional(),
      city: z.string().max(120).optional(),
      tagIds: z.array(uuid).max(20).optional(),
      createdFrom: z.coerce.date().optional(),
      createdTo: z.coerce.date().optional(),
    }), {
      search,
      status: status || undefined,
      customerType: customerType || undefined,
      categoryId: categoryId || undefined,
      governorate: governorate || undefined,
      city: city || undefined,
      tagIds: tagIds ? tagIds.split(',').filter(Boolean) : undefined,
      createdFrom: createdFrom || undefined,
      createdTo: createdTo || undefined,
    });
    this.assertDateRange(parsed.createdFrom, parsed.createdTo);
    return this.service.exportCsv({ companyId: this.company(companyId), ...parsed });
  }

  @Post()
  @RequirePermission('customers.create')
  create(
    @Headers('x-company-id') companyId: string | undefined,
    @Headers('x-branch-id') branchId: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.service.create(
      parseWithSchema(createSchema, body),
      this.idempotency(idempotencyKey),
      this.context(companyId, branchId, requestId, req.user),
    );
  }

  @Get(':id/sensitive')
  @RequirePermission('customers.view-sensitive')
  sensitive(@Param('id') id: string, @Headers('x-company-id') companyId: string | undefined) {
    return this.service.getSensitive(this.company(companyId), parseWithSchema(uuid, id));
  }

  @Get(':id')
  @RequirePermission('customers.view')
  get(@Param('id') id: string, @Headers('x-company-id') companyId: string | undefined) {
    return this.service.get(this.company(companyId), parseWithSchema(uuid, id));
  }

  @Patch(':id')
  @RequirePermission('customers.update')
  update(
    @Param('id') id: string,
    @Headers('x-company-id') companyId: string | undefined,
    @Headers('x-branch-id') branchId: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(
      parseWithSchema(uuid, id),
      parseWithSchema(updateSchema, body),
      this.context(companyId, branchId, requestId, req.user),
    );
  }

  @Patch(':id/status')
  @RequirePermission('customers.change-status')
  status(
    @Param('id') id: string,
    @Headers('x-company-id') companyId: string | undefined,
    @Headers('x-branch-id') branchId: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const input = parseWithSchema(statusSchema, body);
    return this.service.changeStatus(
      parseWithSchema(uuid, id),
      input.status,
      input.version,
      this.context(companyId, branchId, requestId, req.user),
    );
  }

  @Post(':id/addresses')
  @RequirePermission('customers.update')
  addAddress(
    @Param('id') id: string,
    @Headers('x-company-id') companyId: string | undefined,
    @Headers('x-branch-id') branchId: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.service.addAddress(
      parseWithSchema(uuid, id),
      parseWithSchema(addressSchema, body),
      this.context(companyId, branchId, requestId, req.user),
    );
  }

  @Patch(':id/addresses/:addressId')
  @RequirePermission('customers.update')
  updateAddress(
    @Param('id') id: string,
    @Param('addressId') addressId: string,
    @Headers('x-company-id') companyId: string | undefined,
    @Headers('x-branch-id') branchId: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.service.updateAddress(
      parseWithSchema(uuid, id),
      parseWithSchema(uuid, addressId),
      parseWithSchema(addressUpdateSchema, body),
      this.context(companyId, branchId, requestId, req.user),
    );
  }

  @Post(':id/addresses/:addressId/default')
  @RequirePermission('customers.update')
  setDefault(
    @Param('id') id: string,
    @Param('addressId') addressId: string,
    @Headers('x-company-id') companyId: string | undefined,
    @Headers('x-branch-id') branchId: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Req() req: AuthRequest,
  ) {
    return this.service.setDefaultAddress(
      parseWithSchema(uuid, id),
      parseWithSchema(uuid, addressId),
      this.context(companyId, branchId, requestId, req.user),
    );
  }

  @Post(':id/addresses/:addressId/deactivate')
  @RequirePermission('customers.update')
  deactivateAddress(
    @Param('id') id: string,
    @Param('addressId') addressId: string,
    @Headers('x-company-id') companyId: string | undefined,
    @Headers('x-branch-id') branchId: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const input = parseWithSchema(z.object({ version: z.number().int().min(1) }), body);
    return this.service.deactivateAddress(
      parseWithSchema(uuid, id),
      parseWithSchema(uuid, addressId),
      input.version,
      this.context(companyId, branchId, requestId, req.user),
    );
  }

  private company(value: string | undefined): string {
    return parseWithSchema(uuid, value);
  }

  private idempotency(value: string | undefined): string {
    return parseWithSchema(z.string().min(8).max(100), value);
  }

  private context(
    companyId: string | undefined,
    branchId: string | undefined,
    requestId: string | undefined,
    user: AccessPrincipal,
  ): CustomerMutationContext {
    return {
      companyId: this.company(companyId),
      actorId: user.userId,
      branchId: branchId ? parseWithSchema(uuid, branchId) : undefined,
      requestId: requestId?.slice(0, 100),
    };
  }

  private assertDateRange(from: Date | undefined, to: Date | undefined): void {
    if (from && to && from > to) {
      throw new ValidationError('createdFrom must be before createdTo');
    }
  }
}