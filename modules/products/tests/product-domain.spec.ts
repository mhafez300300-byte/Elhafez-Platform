import { describe, expect, it } from 'vitest';
import { assertActivationReady, normalizeBarcode, normalizeProductDraft, normalizeSearchText, ProductDomainError } from '../backend/domain/product';

describe('Products domain',()=>{
 it('normalizes Arabic search text without destroying semantic content',()=>{expect(normalizeSearchText('  أقراص  بنادول  ')).toBe('اقراص بنادول');});
 it('preserves significant barcode leading zeroes',()=>{expect(normalizeBarcode(' 0123456789012 ')).toBe('0123456789012');});
 it('requires exactly one base unit for activation',()=>{const draft=normalizeProductDraft({productType:'NON_DRUG',displayName:'Test',units:[{name:'Piece',conversionFactor:1}]});expect(()=>assertActivationReady(draft)).toThrow(ProductDomainError);});
 it('accepts a valid active drug profile',()=>{const draft=normalizeProductDraft({productType:'DRUG',displayName:'Drug',ingredients:[{ingredientId:'11111111-1111-4111-8111-111111111111',strengthValue:'500',strengthUnit:'mg'}],units:[{name:'Tablet',conversionFactor:'1',isBase:true}],barcodes:[{value:'0123456789012',unitRef:'u0',isPrimary:true}]});expect(()=>assertActivationReady(draft)).not.toThrow();});
 it('rejects drug ingredients on non-drug products',()=>{expect(()=>normalizeProductDraft({productType:'NON_DRUG',displayName:'Device',ingredients:[{ingredientId:'11111111-1111-4111-8111-111111111111'}]})).toThrow(ProductDomainError);});
 it('rejects duplicate active barcodes before persistence',()=>{expect(()=>normalizeProductDraft({productType:'NON_DRUG',displayName:'Item',barcodes:[{value:'12345'},{value:'12345'}]})).toThrow(ProductDomainError);});
});
