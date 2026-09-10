import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '@elhafez/database';
import { createTestApp, resetDatabase } from './test-app';

const PASSWORD = 'StrongPassword123!';
type Session = { accessToken:string; userId:string };

describe('Products v1 combination medicine import regression', () => {
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
    const company = await prisma.coreCompany.create({ data:{ code:'PROD-COMBO', name:'Products Combination Tests' } });
    companyId = company.id;
    branchId = (await prisma.coreBranch.create({ data:{ companyId, code:'MAIN', name:'Main' } })).id;
    admin = await createSession('products-combination-admin@example.com');
  });

  afterAll(() => app.close());

  async function createSession(email:string): Promise<Session> {
    const user = await prisma.coreUser.create({ data:{ email, displayName:email, platformAdmin:true } });
    await prisma.coreAuthCredential.create({ data:{ userId:user.id, login:email, passwordHash:await bcrypt.hash(PASSWORD,12) } });
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ login:email, password:PASSWORD }).expect(201);
    return { accessToken:login.body.accessToken as string, userId:user.id };
  }

  function auth() { return { Authorization:`Bearer ${admin.accessToken}` }; }
  function scoped() { return { ...auth(), 'x-company-id':companyId, 'x-branch-id':branchId }; }

  it('imports single and multi-ingredient company drugs, replays safely, and rejects duplicate composition in preflight', async () => {
    const rows = [
      {
        row:1, productCode:'COMBO-SINGLE', displayName:'Single Ingredient', productType:'DRUG',
        ingredients:[{ name:'Paracetamol', strengthValue:'500', strengthUnit:'mg' }], baseUnitName:'Tablet',
      },
      {
        row:2, productCode:'COMBO-MULTI', displayName:'Combination Medicine', productType:'DRUG',
        ingredients:[
          { name:'Paracetamol', strengthValue:'500', strengthUnit:'mg' },
          { name:'Caffeine', strengthValue:'65', strengthUnit:'mg' },
          { name:'Codeine', strengthValue:'8', strengthUnit:'mg' },
        ],
        baseUnitName:'Tablet', packageUnitName:'Box', packageFactor:'20', barcode:'0009876543210',
      },
    ];

    const preflight = await request(app.getHttpServer())
      .post('/api/products/import-preflight-v1/company')
      .set(scoped())
      .send({ mode:'CREATE_ONLY', rows })
      .expect(201);
    expect(preflight.body.rejected).toBe(0);

    const duplicateComposition = await request(app.getHttpServer())
      .post('/api/products/import-preflight-v1/company')
      .set(scoped())
      .send({ mode:'CREATE_ONLY', rows:[{
        row:3, displayName:'Bad Combination', productType:'DRUG',
        ingredients:[{ name:'Aspirin', strengthValue:'100' },{ name:' aspirin ', strengthValue:'50' }],
      }] })
      .expect(201);
    expect(duplicateComposition.body.rejected).toBe(1);
    expect(duplicateComposition.body.rows[0].reasons.join(' ')).toContain('duplicates another active ingredient');

    const session = await request(app.getHttpServer())
      .post('/api/products/import/sessions')
      .set(scoped())
      .set('Idempotency-Key','company-combination-session-001')
      .send({ mode:'CREATE_ONLY', totalRows:rows.length, sourceName:'TEST COMBINATION FIXTURE' })
      .expect(201);

    const chunk = await request(app.getHttpServer())
      .post(`/api/products/import/sessions/${session.body.id}/chunks`)
      .set(scoped())
      .send({ chunkKey:'rows-1-2', rows })
      .expect(201);
    expect(chunk.body.result.accepted).toBe(2);
    expect(chunk.body.result.rejected).toBe(0);

    const single = await prisma.product.findUniqueOrThrow({ where:{ companyId_productCode:{ companyId, productCode:'COMBO-SINGLE' } }, include:{ ingredients:{ include:{ ingredient:true } } } });
    const multi = await prisma.product.findUniqueOrThrow({ where:{ companyId_productCode:{ companyId, productCode:'COMBO-MULTI' } }, include:{ ingredients:{ include:{ ingredient:true }, orderBy:{ sortOrder:'asc' } } } });
    expect(single.ingredients.map((item) => item.ingredient.name)).toEqual(['Paracetamol']);
    expect(multi.ingredients.map((item) => item.ingredient.name)).toEqual(['Paracetamol','Caffeine','Codeine']);
    expect(multi.ingredients.map((item) => item.strengthValue?.toString())).toEqual(['500','65','8']);

    const replay = await request(app.getHttpServer())
      .post(`/api/products/import/sessions/${session.body.id}/chunks`)
      .set(scoped())
      .send({ chunkKey:'rows-1-2', rows })
      .expect(201);
    expect(replay.body.replayed).toBe(true);
    expect(await prisma.productIngredientAssignment.count({ where:{ productId:multi.id } })).toBe(3);
    expect(await prisma.product.count({ where:{ companyId, productCode:'COMBO-MULTI' } })).toBe(1);
  });

  it('rolls back all company writes when a later ingredient in a combination is invalid', async () => {
    const session = await request(app.getHttpServer())
      .post('/api/products/import/sessions')
      .set(scoped())
      .set('Idempotency-Key','company-combination-rollback-001')
      .send({ mode:'CREATE_ONLY', totalRows:1, sourceName:'TEST ROLLBACK FIXTURE' })
      .expect(201);

    const row = {
      row:1, productCode:'ROLLBACK-COMBO', displayName:'Rollback Combination', productType:'DRUG',
      manufacturerName:'Rollback Manufacturer', baseUnitName:'Tablet',
      ingredients:[
        { name:'Rollback Ingredient One', strengthValue:'10', strengthUnit:'mg' },
        { name:'Rollback Ingredient Two', strengthValue:'not-a-decimal', strengthUnit:'mg' },
      ],
    };
    const result = await request(app.getHttpServer())
      .post(`/api/products/import/sessions/${session.body.id}/chunks`)
      .set(scoped())
      .send({ chunkKey:'rollback-row', rows:[row] })
      .expect(201);
    expect(result.body.result.rejected).toBe(1);
    expect(await prisma.product.count({ where:{ companyId, productCode:'ROLLBACK-COMBO' } })).toBe(0);
    expect(await prisma.productManufacturer.count({ where:{ companyId, name:'Rollback Manufacturer' } })).toBe(0);
    expect(await prisma.productIngredientMaster.count({ where:{ companyId, name:{ in:['Rollback Ingredient One','Rollback Ingredient Two'] } } })).toBe(0);
    expect(await prisma.productIngredientAssignment.count()).toBe(0);
  });

  it('ingests all central ingredients, replays without duplicates, and adoption preserves the full composition', async () => {
    const source = await request(app.getHttpServer())
      .post('/api/products/central/sources')
      .set(auth())
      .send({
        sourceKey:'combo-fixture-source', name:'TEST COMBINATION SOURCE',
        provenance:'Synthetic combination-medicine regression fixture; not an approved Egyptian dataset.',
        licenseNote:'Automated tests only', active:true,
      })
      .expect(201);

    const row = {
      row:1, sourceRecordKey:'CENT-COMBO-001', canonicalName:'Central Combination Medicine',
      manufacturerName:'Central Fixture Pharma', dosageForm:'Tablet', baseUnitLabel:'Tablet',
      packageUnitLabel:'Box', conversionFactor:'10', barcode:'0011223344556',
      ingredients:[
        { name:'Ingredient Alpha', strengthValue:'100', strengthUnit:'mg' },
        { name:'Ingredient Beta', strengthValue:'25', strengthUnit:'mg' },
        { name:'Ingredient Gamma', strengthValue:'5', strengthUnit:'mg' },
      ],
    };

    const preflight = await request(app.getHttpServer())
      .post('/api/products/import-preflight-v1/central')
      .set(auth())
      .send({ sourceId:source.body.id, rows:[row] })
      .expect(201);
    expect(preflight.body.rejected).toBe(0);

    const session = await request(app.getHttpServer())
      .post('/api/products/central/import/sessions')
      .set(auth())
      .set('Idempotency-Key','central-combination-session-001')
      .send({ sourceId:source.body.id, datasetKey:'combo-fixture-v1', totalRows:1, sourceName:'TEST FIXTURE' })
      .expect(201);

    const imported = await request(app.getHttpServer())
      .post(`/api/products/central/import/sessions/${session.body.id}/chunks`)
      .set(auth())
      .send({ chunkKey:'central-combo-row', rows:[row] })
      .expect(201);
    expect(imported.body.result.accepted).toBe(1);
    const centralId = imported.body.result.rows[0].centralDrugId as string;
    const central = await prisma.centralDrugReference.findUniqueOrThrow({ where:{ id:centralId }, include:{ ingredients:{ orderBy:{ sortOrder:'asc' } } } });
    expect(central.ingredients.map((item) => item.name)).toEqual(['Ingredient Alpha','Ingredient Beta','Ingredient Gamma']);

    const replay = await request(app.getHttpServer())
      .post(`/api/products/central/import/sessions/${session.body.id}/chunks`)
      .set(auth())
      .send({ chunkKey:'central-combo-row', rows:[row] })
      .expect(201);
    expect(replay.body.replayed).toBe(true);
    expect(await prisma.centralDrugIngredient.count({ where:{ centralDrugId:centralId } })).toBe(3);

    const adopted = await request(app.getHttpServer())
      .post(`/api/products/central/${centralId}/adopt`)
      .set(scoped())
      .set('Idempotency-Key','central-combination-adopt-001')
      .expect(201);
    const productId = adopted.body.product.id as string;
    const productIngredients = await prisma.productIngredientAssignment.findMany({ where:{ productId }, include:{ ingredient:true }, orderBy:{ sortOrder:'asc' } });
    expect(productIngredients.map((item) => item.ingredient.name)).toEqual(['Ingredient Alpha','Ingredient Beta','Ingredient Gamma']);

    const adoptedAgain = await request(app.getHttpServer())
      .post(`/api/products/central/${centralId}/adopt`)
      .set(scoped())
      .set('Idempotency-Key','central-combination-adopt-001')
      .expect(201);
    expect(adoptedAgain.body.product.id).toBe(productId);
    expect(await prisma.productIngredientAssignment.count({ where:{ productId } })).toBe(3);
    expect(await prisma.product.count({ where:{ companyId, centralReferenceId:centralId } })).toBe(1);
  });

  it('rolls back a central combination row when a later ingredient fails and keeps retry state safe', async () => {
    const source = await request(app.getHttpServer())
      .post('/api/products/central/sources')
      .set(auth())
      .send({ sourceKey:'combo-rollback-source', name:'TEST ROLLBACK SOURCE', provenance:'Synthetic rollback fixture only.', active:true })
      .expect(201);
    const session = await request(app.getHttpServer())
      .post('/api/products/central/import/sessions')
      .set(auth())
      .set('Idempotency-Key','central-combination-rollback-001')
      .send({ sourceId:source.body.id, datasetKey:'rollback-v1', totalRows:1, sourceName:'TEST ROLLBACK' })
      .expect(201);
    const badRow = {
      row:1, sourceRecordKey:'CENT-ROLLBACK-001', canonicalName:'Central Rollback Combination',
      ingredients:[
        { name:'Central Rollback One', strengthValue:'10', strengthUnit:'mg' },
        { name:'Central Rollback Two', strengthValue:'invalid', strengthUnit:'mg' },
      ],
    };
    const first = await request(app.getHttpServer())
      .post(`/api/products/central/import/sessions/${session.body.id}/chunks`)
      .set(auth())
      .send({ chunkKey:'central-rollback-row', rows:[badRow] })
      .expect(201);
    expect(first.body.result.rejected).toBe(1);
    expect(await prisma.centralDrugReference.count({ where:{ sourceId:source.body.id, sourceRecordKey:'CENT-ROLLBACK-001' } })).toBe(0);
    expect(await prisma.centralDrugIngredient.count({ where:{ name:{ in:['Central Rollback One','Central Rollback Two'] } } })).toBe(0);

    const duplicateReplay = await request(app.getHttpServer())
      .post(`/api/products/central/import/sessions/${session.body.id}/chunks`)
      .set(auth())
      .send({ chunkKey:'central-rollback-row', rows:[badRow] })
      .expect(201);
    expect(duplicateReplay.body.replayed).toBe(true);
    expect(await prisma.centralDrugReference.count({ where:{ sourceId:source.body.id, sourceRecordKey:'CENT-ROLLBACK-001' } })).toBe(0);
  });
});
