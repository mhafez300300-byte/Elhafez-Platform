import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { supplierLayoutForWidth } from '../frontend/workspace';

describe('suppliers responsive UI contract', () => {
  it('maps supported viewport widths to mobile, tablet, and desktop modes', () => {
    expect(supplierLayoutForWidth(360)).toBe('mobile');
    expect(supplierLayoutForWidth(719)).toBe('mobile');
    expect(supplierLayoutForWidth(720)).toBe('tablet');
    expect(supplierLayoutForWidth(1079)).toBe('tablet');
    expect(supplierLayoutForWidth(1080)).toBe('desktop');
    expect(supplierLayoutForWidth(1440)).toBe('desktop');
  });

  it('contains tablet and mobile CSS breakpoints with mobile cards replacing the wide table', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../frontend/suppliers.css'), 'utf8');
    expect(css).toContain('@media(max-width:1079px)');
    expect(css).toContain('@media(max-width:719px)');
    expect(css).toContain('.suppliers-table-wrap{display:none}');
    expect(css).toContain('.suppliers-cards{display:grid');
    expect(css).toContain('.form-grid{grid-template-columns:1fr}');
  });
});
