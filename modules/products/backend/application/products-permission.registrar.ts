import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { PERMISSION_DEFINITION_REGISTRY, definePermissionDefinitions, type PermissionDefinitionRegistry } from '@elhafez/permissions/contracts';

export const PRODUCT_PERMISSION_DEFINITIONS = definePermissionDefinitions([
 {key:'products.view',description:'View products in an authorized company scope'},
 {key:'products.create',description:'Create products in an authorized company scope'},
 {key:'products.update',description:'Update product master data in an authorized company scope'},
 {key:'products.change-status',description:'Change product lifecycle status in an authorized company scope'},
 {key:'products.manage-units',description:'Manage product units and package conversions'},
 {key:'products.manage-barcodes',description:'Manage product and package barcodes'},
 {key:'products.manage-classification',description:'Manage product categories tags manufacturers and pharmaceutical reference masters'},
 {key:'products.bulk-update',description:'Bulk update product master data in an authorized company scope'},
 {key:'products.import',description:'Import product catalog data into an authorized company scope'},
 {key:'products.export',description:'Export product catalog data from an authorized company scope'},
 {key:'products.view-audit',description:'View Products audit history through the authorized audit capability'},
 {key:'products.central-catalog.view',description:'View the Central Egyptian Drug Reference Catalog'},
 {key:'products.central-catalog.use',description:'Adopt and synchronize Central Egyptian Drug references into an authorized company'},
 {key:'products.central-catalog.manage',description:'Globally manage Central Egyptian Drug Reference Catalog sources and ingestion'},
] as const);

@Injectable()
export class ProductsPermissionRegistrar implements OnModuleInit {
 constructor(@Inject(PERMISSION_DEFINITION_REGISTRY) private readonly registry:PermissionDefinitionRegistry){}
 async onModuleInit():Promise<void>{await this.registry.registerDefinitions(PRODUCT_PERMISSION_DEFINITIONS);}
}
