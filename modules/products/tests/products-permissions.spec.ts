import { describe, expect, it } from 'vitest';
import { PRODUCT_PERMISSION_DEFINITIONS } from '../backend/application/products-permission.registrar';

describe('Products permission registration',()=>{
 it('uses the approved canonical permission keys',()=>{expect(PRODUCT_PERMISSION_DEFINITIONS.map(x=>x.key)).toEqual(['products.view','products.create','products.update','products.change-status','products.manage-units','products.manage-barcodes','products.manage-classification','products.bulk-update','products.import','products.export','products.view-audit','products.central-catalog.view','products.central-catalog.use','products.central-catalog.manage']);});
 it('never uses underscores in business permission keys',()=>{for(const permission of PRODUCT_PERMISSION_DEFINITIONS)expect(permission.key).not.toContain('_');});
});
