import { describe, expect, it } from 'vitest';
import { productLayoutForWidth } from '../frontend/workspace';
import { createXlsx } from '../frontend/spreadsheet';

describe('Products responsive and spreadsheet contracts',()=>{
 it('selects mobile/tablet/desktop layouts at commercial breakpoints',()=>{expect(productLayoutForWidth(390)).toBe('mobile');expect(productLayoutForWidth(800)).toBe('tablet');expect(productLayoutForWidth(1440)).toBe('desktop');});
 it('creates a real XLSX ZIP payload without external spreadsheet dependencies',async()=>{const blob=createXlsx({headers:['barcode','name'],rows:[['0123456789012','Drug']]},'Products');const bytes=new Uint8Array(await blob.arrayBuffer());expect(bytes[0]).toBe(0x50);expect(bytes[1]).toBe(0x4b);expect(blob.type).toContain('spreadsheetml');});
});
