import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ValidationError } from '@elhafez/errors';
import { RequirePermission, type AccessPrincipal } from '@elhafez/platform-contracts';
import { parseWithSchema } from '@elhafez/validation';
import { z } from 'zod';
import { SuppliersService, type SupplierImportRow, type SupplierMutationContext } from '../application/suppliers.service';

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
const contactSchema = z.object({
  name: z.string().min(1).max(180),
  jobTitle: optionalText(120),
  phone: optionalText(40),
  whatsappPhone: optionalText(40),
  email: optionalText(254),
  isPrimary: z.boolean().optional(),
});
const supplierDraftSchema = z.object({
  supplierType: z.enum(['INDIVIDUAL', 'COMPANY']),
  legalName: z.string().min(1).max(180),
  tradeName: optionalText(180),
  primaryPhone: optionalText(40),
  secondaryPhone: optionalText(40),
  whatsappPhone: optionalText(40),
  email: optionalText(254),
  website: optionalText(300),
  nationalId: optionalText(100),
  taxNumber: optionalText(100),
  commercialRegistration: optionalText(120),
  categoryId: uuid.nullable().optional(),
  notes: optionalText(4000),
  tagIds: z.array(uuid).max(50).optional(),
});
const createSchema = supplierDraftSchema.extend({
  addresses: z.array(addressSchema).max(20).optional(),
  contacts: z.array(contactSchema).max(20).optional(),
});
const updateSchema = supplierDraftSchema.partial().extend({ version: z.number().int().min(1) });
const statusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']), version: z.number().int().min(1) });
const addressUpdateSchema = addressSchema.partial().extend({ version: z.number().int().min(1) });
const contactUpdateSchema = contactSchema.partial().extend({ version: z.number().int().min(1) });
const classificationCreateSchema = z.object({ name: z.string().min(1).max(120) });
const classificationUpdateSchema = z.object({ name: z.string().min(1).max(120), active: z.boolean() });
const importRowSchema = supplierDraftSchema.extend({
  addressLabel: optionalText(80),
  governorate: optionalText(120),
  city: optionalText(120),
  street: optionalText(180),
  addressDetails: optionalText(600),
  landmark: optionalText(180),
  addressPhone: optionalText(40),
  contactName: optionalText(180),
  contactJobTitle: optionalText(120),
  contactPhone: optionalText(40),
  contactWhatsappPhone: optionalText(40),
  contactEmail: optionalText(254),
  contactIsPrimary: z.boolean().optional(),
});
const importSchema = z.object({ rows: z.array(importRowSchema).min(1).max(1000) });
const listSchema = z.object({
  search: z.string().max(180).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']).optional(),
  supplierType: z.enum(['INDIVIDUAL', 'COMPANY']).optional(),
  categoryId: uuid.optional(),
  governorate: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
  tagIds: z.array(uuid).max(20).optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

type AuthRequest = { user: AccessPrincipal };
type ListInput = {
  search?: string;
  status?: string;
  supplierType?: string;
  categoryId?: string;
  governorate?: string;
  city?: string;
  tagIds?: string;
  createdFrom?: string;
  createdTo?: string;
  page?: string;
  pageSize?: string;
};

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly service: SuppliersService) {}

  @Get()
  @RequirePermission('suppliers.view')
  list(
    @Headers('x-company-id') companyId: string | undefined,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('supplierType') supplierType?: string,
    @Query('categoryId') categoryId?: string,
    @Query('governorate') governorate?: string,
    @Query('city') city?: string,
    @Query('tagIds') tagIds?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const parsed = this.listQuery({ search, status, supplierType, categoryId, governorate, city, tagIds, createdFrom, createdTo, page, pageSize });
    return this.service.list({
      companyId: this.company(companyId),
      ...parsed,
      page: parsed.page ?? 1,
      pageSize: parsed.pageSize ?? 25,
    });
  }

  @Get('categories')
  @RequirePermission('suppliers.view')
  categories(@Headers('x-company-id') companyId: string | undefined, @Query('includeInactive') includeInactive?: string) {
    return this.service.listCategories(this.company(companyId), includeInactive === 'true');
  }

  @Post('categories')
  @RequirePermission('suppliers.update')
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
  @RequirePermission('suppliers.update')
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
  @RequirePermission('suppliers.view')
  tags(@Headers('x-company-id') companyId: string | undefined, @Query('includeInactive') includeInactive?: string) {
    return this.service.listTags(this.company(companyId), includeInactive === 'true');
  }

  @Post('tags')
  @RequirePermission('suppliers.update')
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
  @RequirePermission('suppliers.update')
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
  @RequirePermission('suppliers.view')
  duplicates(@Headers('x-company-id') companyId: string | undefined, @Body() body: unknown) {
    return this.service.findLikelyDuplicates(this.company(companyId), parseWithSchema(supplierDraftSchema, body));
  }

  @Post('import')
  @RequirePermission('suppliers.import')
  importSuppliers(
    @Headers('x-company-id') companyId: string | undefined,
    @Headers('x-branch-id') branchId: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const input = parseWithSchema(importSchema, body);
    return this.service.import(
      input.rows as SupplierImportRow[],
      this.idempotency(idempotencyKey),
      this.context(companyId, branchId, requestId, req.user),
    );
  }

  @Get('export')
  @RequirePermission('suppliers.export')
  exportSuppliers(
    @Headers('x-company-id') companyId: string | undefined,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('supplierType') supplierType?: string,
    @Query('categoryId') categoryId?: string,
    @Query('governorate') governorate?: string,
    @Query('city') city?: string,
    @Query('tagIds') tagIds?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
  ) {
    const parsed = this.listQuery({ search, status, supplierType, categoryId, governorate, city, tagIds, createdFrom, createdTo });
    const { page: _page, pageSize: _pageSize, ...filters } = parsed;
    return this.service.exportCsv({ companyId: this.company(companyId), ...filters });
  }

  @Post()
  @RequirePermission('suppliers.create')
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
  @RequirePermission('suppliers.view-sensitive')
  sensitive(@Param('id') id: string, @Headers('x-company-id') companyId: string | undefined) {
    return this.service.getSensitive(this.company(companyId), parseWithSchema(uuid, id));
  }

  @Get(':id')
  @RequirePermission('suppliers.view')
  get(@Param('id') id: string, @Headers('x-company-id') companyId: string | undefined) {
    return this.service.get(this.company(companyId), parseWithSchema(uuid, id));
  }

  @Patch(':id')
  @RequirePermission('suppliers.update')
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
  @RequirePermission('suppliers.change-status')
  status(
    @Param('id') id: string,
    @Headers('x-company-id') companyId: string | undefined,
    @Headers('x-branch-id') branchId: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const input = parseWithSchema(statusSchema, body);
    return this.service.changeStatus(parseWithSchema(uuid, id), input.status, input.version, this.context(companyId, branchId, requestId, req.user));
  }

  @Post(':id/addresses')
  @RequirePermission('suppliers.update')
  addAddress(
    @Param('id') id: string,
    @Headers('x-company-id') companyId: string | undefined,
    @Headers('x-branch-id') branchId: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.service.addAddress(parseWithSchema(uuid, id), parseWithSchema(addressSchema, body), this.context(companyId, branchId, requestId, req.user));
  }

  @Patch(':id/addresses/:addressId')
  @RequirePermission('suppliers.update')
  updateAddress(
    @Param('id') id: string,
    @Param('addressId') addressId: string,
    @Headers('x-company-id') companyId: string | undefined,
    @Headers('x-branch-id') branchId: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.service.updateAddress(parseWithSchema(uuid, id), parseWithSchema(uuid, addressId), parseWithSchema(addressUpdateSchema, body), this.context(companyId, branchId, requestId, req.user));
  }

  @Post(':id/addresses/:addressId/default')
  @RequirePermission('suppliers.update')
  setDefaultAddress(
    @Param('id') id: string,
    @Param('addressId') addressId: string,
    @Headers('x-company-id') companyId: string | undefined,
    @Headers('x-branch-id') branchId: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Req() req: AuthRequest,
  ) {
    return this.service.setDefaultAddress(parseWithSchema(uuid, id), parseWithSchema(uuid, addressId), this.context(companyId, branchId, requestId, req.user));
  }

  @Post(':id/addresses/:addressId/deactivate')
  @RequirePermission('suppliers.update')
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
    return this.service.deactivateAddress(parseWithSchema(uuid, id), parseWithSchema(uuid, addressId), input.version, this.context(companyId, branchId, requestId, req.user));
  }

  @Post(':id/contacts')
  @RequirePermission('suppliers.update')
  addContact(
    @Param('id') id: string,
    @Headers('x-company-id') companyId: string | undefined,
    @Headers('x-branch-id') branchId: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.service.addContact(parseWithSchema(uuid, id), parseWithSchema(contactSchema, body), this.context(companyId, branchId, requestId, req.user));
  }

  @Patch(':id/contacts/:contactId')
  @RequirePermission('suppliers.update')
  updateContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Headers('x-company-id') companyId: string | undefined,
    @Headers('x-branch-id') branchId: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.service.updateContact(parseWithSchema(uuid, id), parseWithSchema(uuid, contactId), parseWithSchema(contactUpdateSchema, body), this.context(companyId, branchId, requestId, req.user));
  }

  @Post(':id/contacts/:contactId/primary')
  @RequirePermission('suppliers.update')
  setPrimaryContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Headers('x-company-id') companyId: string | undefined,
    @Headers('x-branch-id') branchId: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Req() req: AuthRequest,
  ) {
    return this.service.setPrimaryContact(parseWithSchema(uuid, id), parseWithSchema(uuid, contactId), this.context(companyId, branchId, requestId, req.user));
  }

  @Post(':id/contacts/:contactId/deactivate')
  @RequirePermission('suppliers.update')
  deactivateContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Headers('x-company-id') companyId: string | undefined,
    @Headers('x-branch-id') branchId: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const input = parseWithSchema(z.object({ version: z.number().int().min(1) }), body);
    return this.service.deactivateContact(parseWithSchema(uuid, id), parseWithSchema(uuid, contactId), input.version, this.context(companyId, branchId, requestId, req.user));
  }

  private listQuery(input: ListInput) {
    const parsed = parseWithSchema(listSchema, {
      search: input.search || undefined,
      status: input.status || undefined,
      supplierType: input.supplierType || undefined,
      categoryId: input.categoryId || undefined,
      governorate: input.governorate || undefined,
      city: input.city || undefined,
      tagIds: input.tagIds ? input.tagIds.split(',').filter(Boolean) : undefined,
      createdFrom: input.createdFrom || undefined,
      createdTo: input.createdTo || undefined,
      page: input.page ?? 1,
      pageSize: input.pageSize ?? 25,
    });
    if (parsed.createdFrom && parsed.createdTo && parsed.createdFrom > parsed.createdTo) throw new ValidationError('createdFrom must be before createdTo');
    return parsed;
  }

  private company(value: string | undefined): string {
    return parseWithSchema(uuid, value);
  }

  private idempotency(value: string | undefined): string {
    return parseWithSchema(z.string().min(8).max(100), value);
  }

  private context(companyId: string | undefined, branchId: string | undefined, requestId: string | undefined, user: AccessPrincipal): SupplierMutationContext {
    return {
      companyId: this.company(companyId),
      actorId: user.userId,
      branchId: branchId ? parseWithSchema(uuid, branchId) : undefined,
      requestId: requestId?.slice(0, 100),
    };
  }
}
