import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { customerLayoutForWidth } from '../frontend/workspace';

describe('customers responsive UI contract', () => {
  it('maps supported viewport widths to mobile, tablet, and desktop modes', () => {
    expect(customerLayoutForWidth(360)).toBe('mobile');
    expect(customerLayoutForWidth(719)).toBe('mobile');
    expect(customerLayoutForWidth(720)).toBe('tablet');
    expect(customerLayoutForWidth(1079)).toBe('tablet');
    expect(customerLayoutForWidth(1080)).toBe('desktop');
    expect(customerLayoutForWidth(1440)).toBe('desktop');
  });

  it('contains tablet and mobile CSS breakpoints with mobile cards replacing the wide table', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../frontend/customers.css'), 'utf8');
    expect(css).toContain('@media(max-width:1079px)');
    expect(css).toContain('@media(max-width:719px)');
    expect(css).toContain('.customers-table-wrap{display:none}');
    expect(css).toContain('.customers-cards{display:grid');
    expect(css).toContain('.form-grid{grid-template-columns:1fr}');
  });
});
