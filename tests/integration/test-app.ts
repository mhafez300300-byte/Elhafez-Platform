import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../apps/api/src/app.module';
import { PrismaService } from '@elhafez/database';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.productImportChunk.deleteMany();
  await prisma.productImportSession.deleteMany();
  await prisma.productBarcode.deleteMany();
  await prisma.productUnit.deleteMany();
  await prisma.productTagAssignment.deleteMany();
  await prisma.productIngredientAssignment.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productCategory.updateMany({ data: { parentId: null } });
  await prisma.productCategory.deleteMany();
  await prisma.productTag.deleteMany();
  await prisma.productManufacturer.deleteMany();
  await prisma.productIngredientMaster.deleteMany();
  await prisma.productDosageForm.deleteMany();
  await prisma.productRoute.deleteMany();
  await prisma.centralDrugBarcode.deleteMany();
  await prisma.centralDrugIngredient.deleteMany();
  await prisma.centralDrugReference.deleteMany();
  await prisma.centralDrugDataset.deleteMany();
  await prisma.centralDrugSource.deleteMany();
  await prisma.supplierTagAssignment.deleteMany();
  await prisma.supplierContact.deleteMany();
  await prisma.supplierAddress.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.supplierCategory.deleteMany();
  await prisma.supplierTag.deleteMany();
  await prisma.customerTagAssignment.deleteMany();
  await prisma.customerAddress.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.customerCategory.deleteMany();
  await prisma.customerTag.deleteMany();
  await prisma.coreAuditRecord.deleteMany();
  await prisma.coreNotification.deleteMany();
  await prisma.coreFileRecord.deleteMany();
  await prisma.coreUserRoleAssignment.deleteMany();
  await prisma.coreRolePermission.deleteMany();
  await prisma.corePermission.deleteMany();
  await prisma.coreAuthSession.deleteMany();
  await prisma.coreAuthCredential.deleteMany();
  await prisma.coreBranch.deleteMany();
  await prisma.coreRole.deleteMany();
  await prisma.coreCompany.deleteMany();
  await prisma.coreUser.deleteMany();
}
