import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '@elhafez/database';
import { createTestApp, resetDatabase } from './test-app';

const PASSWORD = 'StrongPassword123!';
type Session = { accessToken:string; userId:string };

describe('Products v1 approved specification coverage', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let companyId: string;
  let branchId: string;
  let admin: Session;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    companyId = (await prisma.coreCompany.create({ data:{ code:'PROD-SPEC', name:'Products Spec Coverage' } })).id;
    branchId = (await prisma.coreBranch.create({ data:{ companyId, code:'MAIN', name:'Main' } })).id;
    admin = await createSession('products-spec-admin@example.com');
  });

  afterAll(() => app.close());

  async function createSession(email:string): Promise<Session> {
    const user = await prisma.coreUser.create({ data:{ email, displayName:email, platformAdmin:true } });
    await prisma.coreAuthCredential.create({
      data:{ userId:user.id, login:email, passwordHash:await bcrypt.hash(PASSWORD,12) },
    });
    const login = await request(app.getHttpServer()).post('/api/auth/login')
      .send({ login:email, password:PASSWORD }).expect(201);
    return { accessToken:login.body.accessToken as string, userId:user.id };
  }

  function auth() { return { Authorization:`Bearer ${admin.accessToken}` }; }
  function scoped() { return { ...auth(), 'x-company-id':companyId, 'x-branch-id':branchId }; }

  it('proves advanced company filters, descendant categories, relational search, dates, and deterministic sorting', async () => {
    const parent = await prisma.productCategory.create({ data:{ companyId, name:'Medicine', normalizedName:'medicine' } });
    const child = await prisma.productCategory.create({ data:{ companyId, name:'Pain Relief', normalizedName:'pain relief', parentId:parent.id } });
    const tag = await prisma.productTag.create({ data:{ companyId, name:'Priority Tag', normalizedName:'priority tag' } });
    const manufacturer = await prisma.productManufacturer.create({ data:{ companyId, name:'Coverage Pharma', normalizedName:'coverage pharma' } });
    const ingredient = await prisma.productIngredientMaster.create({ data:{ companyId, name:'Coverage Ingredient', normalizedName:'coverage ingredient' } });
    const dosage = await prisma.productDosageForm.create({ data:{ companyId, name:'Tablet', normalizedName:'tablet' } });
    const product = await prisma.product.create({ data:{
      companyId, productCode:'SPEC-A', productType:'DRUG', displayName:'Alpha Coverage Medicine', normalizedName:'alpha coverage medicine',
      categoryId:child.id, manufacturerId:manufacturer.id, dosageFormId:dosage.id, prescriptionClass:'RX', marketStatus:'AVAILABLE',
      controlled:true, imageFileId:randomUUID(), status:'ACTIVE',
    } });
    const base = await prisma.productUnit.create({ data:{ productId:product.id, name:'Tablet', conversionFactor:1, isBase:true, defaultSale:true } });
    await prisma.productBarcode.create({ data:{ companyId, productId:product.id, unitId:base.id, value:'0012345678905', isPrimary:true } });
    await prisma.productTagAssignment.create({ data:{ productId:product.id, tagId:tag.id } });
    await prisma.productIngredientAssignment.create({ data:{ productId:product.id, ingredientId:ingredient.id, strengthValue:500, strengthUnit:'mg', sortOrder:0 } });
    await prisma.product.create({ data:{ companyId, productCode:'SPEC-Z', productType:'NON_DRUG', displayName:'Zulu Non Drug', normalizedName:'zulu non drug', status:'DRAFT' } });

    const query = new URLSearchParams({
      categoryId:parent.id,
      tagId:tag.id,
      manufacturerId:manufacturer.id,
      ingredientId:ingredient.id,
      dosageFormId:dosage.id,
      prescriptionClass:'rx',
      marketStatus:'AVAILABLE',
      controlled:'true',
      hasBarcode:'true',
      hasImage:'true',
      createdFrom:'2020-01-01T00:00:00.000Z',
      createdTo:'2035-01-01T00:00:00.000Z',
      updatedFrom:'2020-01-01T00:00:00.000Z',
      updatedTo:'2035-01-01T00:00:00.000Z',
      sortBy:'NAME',
      sortDirection:'asc',
      page:'1',
      pageSize:'25',
    });
    const filtered = await request(app.getHttpServer()).get(`/api/products/query-v1?${query}`).set(scoped()).expect(200);
    expect(filtered.body.items.map((item:{id:string}) => item.id)).toEqual([product.id]);

    for (const search of ['Priority Tag','Coverage Pharma','Coverage Ingredient','0012345678905','SPEC-A']) {
      const found = await request(app.getHttpServer()).get(`/api/products/query-v1?search=${encodeURIComponent(search)}&page=1&pageSize=25`).set(scoped()).expect(200);
      expect(found.body.items.some((item:{id:string}) => item.id === product.id), search).toBe(true);
    }
    const sorted = await request(app.getHttpServer()).get('/api/products/query-v1?sortBy=NAME&sortDirection=asc&page=1&pageSize=25').set(scoped()).expect(200);
    expect(sorted.body.items.map((item:{displayName:string}) => item.displayName)).toEqual(['Alpha Coverage Medicine','Zulu Non Drug']);
    await request(app.getHttpServer()).get('/api/products/query-v1?createdFrom=2030-01-01T00:00:00.000Z&createdTo=2020-01-01T00:00:00.000Z').set(scoped()).expect(400);
  });

  it('proves safe bulk preview, activation invariants, retry idempotency, and single audit emission', async () => {
    const ingredient = await prisma.productIngredientMaster.create({ data:{ companyId, name:'Bulk Ingredient', normalizedName:'bulk ingredient' } });
    const tag = await prisma.productTag.create({ data:{ companyId, name:'Bulk Tag', normalizedName:'bulk tag' } });
    const productIds:string[] = [];
    for (const [index,name] of ['Bulk One','Bulk Two'].entries()) {
      const product = await prisma.product.create({ data:{ companyId, productCode:`BULK-${index+1}`, productType:'DRUG', displayName:name, normalizedName:name.toLowerCase(), status:'DRAFT' } });
      await prisma.productUnit.create({ data:{ productId:product.id, name:'Tablet', conversionFactor:1, isBase:true, defaultSale:true } });
      await prisma.productIngredientAssignment.create({ data:{ productId:product.id, ingredientId:ingredient.id, strengthValue:10, strengthUnit:'mg', sortOrder:0 } });
      productIds.push(product.id);
    }
    const invalid = await prisma.product.create({ data:{ companyId, productCode:'BULK-BAD', productType:'DRUG', displayName:'Bulk Invalid', normalizedName:'bulk invalid', status:'DRAFT' } });
    const invalidPreview = await request(app.getHttpServer()).post('/api/products/bulk-v1/preview').set(scoped())
      .send({ productIds:[invalid.id], patch:{ status:'ACTIVE' } }).expect(201);
    expect(invalidPreview.body.valid).toBe(false);
    expect(invalidPreview.body.issues[0].code).toBe('ACTIVATION_NOT_READY');

    const patch = { status:'ACTIVE', tagIds:[tag.id], controlled:true, marketStatus:'AVAILABLE' };
    const preview = await request(app.getHttpServer()).post('/api/products/bulk-v1/preview').set(scoped())
      .send({ productIds, patch }).expect(201);
    expect(preview.body).toMatchObject({ requested:2, matched:2, wouldChange:2, valid:true });

    const first = await request(app.getHttpServer()).post('/api/products/bulk-v1').set(scoped())
      .set('Idempotency-Key','products-bulk-spec-001').send({ productIds, patch }).expect(201);
    expect(first.body).toMatchObject({ changed:2, requested:2, replayed:false });
    const replay = await request(app.getHttpServer()).post('/api/products/bulk-v1').set(scoped())
      .set('Idempotency-Key','products-bulk-spec-001').send({ productIds, patch }).expect(201);
    expect(replay.body).toMatchObject({ changed:2, requested:2, replayed:true });
    expect(await prisma.productTagAssignment.count({ where:{ productId:{ in:productIds }, tagId:tag.id } })).toBe(2);
    expect(await prisma.product.count({ where:{ id:{ in:productIds }, status:'ACTIVE', controlled:true, marketStatus:'AVAILABLE' } })).toBe(2);
    expect(await prisma.coreAuditRecord.count({ where:{ companyId, entityType:'product-bulk-update', action:'product.bulk-update' } })).toBe(1);

    await request(app.getHttpServer()).post('/api/products/bulk-v1').set(scoped())
      .set('Idempotency-Key','products-bulk-spec-001').send({ productIds, patch:{ status:'INACTIVE' } }).expect(409);
  });

  it('proves central strength search and provenance/dataset detail on the v1 query contract', async () => {
    const source = await request(app.getHttpServer()).post('/api/products/central/sources').set(auth())
      .send({ sourceKey:'spec-central-source', name:'SPEC TEST SOURCE', provenance:'Synthetic Products coverage fixture only; not approved Egyptian market data.', licenseNote:'Tests only', active:true }).expect(201);
    const row = {
      row:1, sourceRecordKey:'SPEC-CENTRAL-1', canonicalName:'Central Coverage Combination', dosageForm:'Tablet',
      ingredients:[{name:'Alpha',strengthValue:'100',strengthUnit:'mg'},{name:'Beta',strengthValue:'25',strengthUnit:'mg'}],
    };
    const session = await request(app.getHttpServer()).post('/api/products/central/import/sessions').set(auth())
      .set('Idempotency-Key','products-central-spec-001')
      .send({ sourceId:source.body.id, datasetKey:'spec-dataset-v1', totalRows:1, sourceName:'SPEC TEST DATASET' }).expect(201);
    const chunk = await request(app.getHttpServer()).post(`/api/products/central/import/sessions/${session.body.id}/chunks`).set(auth())
      .send({ chunkKey:'spec-central-row', rows:[row] }).expect(201);
    const centralId = chunk.body.result.rows[0].centralDrugId as string;

    const byStrength = await request(app.getHttpServer()).get('/api/products/central-v1?strength=25&page=1&pageSize=25').set(scoped()).expect(200);
    expect(byStrength.body.items.some((item:{id:string}) => item.id === centralId)).toBe(true);
    const byIngredient = await request(app.getHttpServer()).get('/api/products/central-v1?search=Beta&page=1&pageSize=25').set(scoped()).expect(200);
    expect(byIngredient.body.items.some((item:{id:string}) => item.id === centralId)).toBe(true);
    const detail = await request(app.getHttpServer()).get(`/api/products/central-v1/${centralId}`).set(scoped()).expect(200);
    expect(detail.body.source).toMatchObject({ sourceKey:'spec-central-source', provenance:'Synthetic Products coverage fixture only; not approved Egyptian market data.' });
    expect(detail.body.dataset).toMatchObject({ datasetKey:'spec-dataset-v1' });
    expect(detail.body.reference.ingredients).toHaveLength(2);
  });

  it('preserves existing ingredient composition when an UPSERT row omits the ingredients column', async () => {
    const createSession = await request(app.getHttpServer()).post('/api/products/import/sessions').set(scoped())
      .set('Idempotency-Key','products-composition-create-001')
      .send({ mode:'CREATE_ONLY', totalRows:1, sourceName:'SPEC CREATE' }).expect(201);
    const createRow = {
      row:1, productCode:'PRESERVE-COMBO', displayName:'Preserve Combination', productType:'DRUG', baseUnitName:'Tablet',
      ingredients:[{name:'Preserve A',strengthValue:'10',strengthUnit:'mg'},{name:'Preserve B',strengthValue:'20',strengthUnit:'mg'}],
    };
    await request(app.getHttpServer()).post(`/api/products/import/sessions/${createSession.body.id}/chunks`).set(scoped())
      .send({ chunkKey:'create-combo', rows:[createRow] }).expect(201);
    const product = await prisma.product.findUniqueOrThrow({ where:{ companyId_productCode:{ companyId, productCode:'PRESERVE-COMBO' } } });
    expect(await prisma.productIngredientAssignment.count({ where:{ productId:product.id } })).toBe(2);

    const updateSession = await request(app.getHttpServer()).post('/api/products/import/sessions').set(scoped())
      .set('Idempotency-Key','products-composition-update-001')
      .send({ mode:'UPSERT_PRODUCT_CODE', totalRows:1, sourceName:'SPEC UPDATE' }).expect(201);
    await request(app.getHttpServer()).post(`/api/products/import/sessions/${updateSession.body.id}/chunks`).set(scoped())
      .send({ chunkKey:'update-without-composition', rows:[{ row:1, productCode:'PRESERVE-COMBO', displayName:'Preserve Combination Renamed', productType:'DRUG' }] }).expect(201);

    const after = await prisma.product.findUniqueOrThrow({ where:{ id:product.id }, include:{ ingredients:{ include:{ ingredient:true }, orderBy:{ sortOrder:'asc' } } } });
    expect(after.displayName).toBe('Preserve Combination Renamed');
    expect(after.ingredients.map((item) => item.ingredient.name)).toEqual(['Preserve A','Preserve B']);
  });
});
