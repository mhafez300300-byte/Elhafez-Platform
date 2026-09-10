import { describe, expect, it } from 'vitest';
import { createXlsx, parseSpreadsheet } from '../frontend/spreadsheet';
import { parseIngredientCell } from '../frontend/v1/import-ingredients';
import { buildImportRows } from '../frontend/v1/import-center';

describe('Products combination-medicine spreadsheet mapping', () => {
  it('parses compact and JSON ingredient compositions without dropping ingredients', () => {
    expect(parseIngredientCell('Paracetamol|500|mg; Caffeine|65|mg')).toEqual([
      { name: 'Paracetamol', strengthValue: '500', strengthUnit: 'mg' },
      { name: 'Caffeine', strengthValue: '65', strengthUnit: 'mg' },
    ]);
    expect(parseIngredientCell('[{"name":"A","strengthValue":"10","strengthUnit":"mg"},{"name":"B"}]')).toEqual([
      { name: 'A', strengthValue: '10', strengthUnit: 'mg' },
      { name: 'B' },
    ]);
  });

  it('preserves a two-ingredient company CSV row through spreadsheet parsing and mapping', async () => {
    const csv = new File([
      'displayName,productType,ingredients,baseUnitName\n"Combo CSV",DRUG,"Paracetamol|500|mg; Caffeine|65|mg",Tablet\n',
    ], 'combo.csv', { type: 'text/csv' });
    const table = await parseSpreadsheet(csv);
    const rows = buildImportRows(table, {
      displayName: 'displayName',
      productType: 'productType',
      ingredients: 'ingredients',
      baseUnitName: 'baseUnitName',
    }, false);
    expect(rows[0]?.ingredients).toEqual([
      { name: 'Paracetamol', strengthValue: '500', strengthUnit: 'mg' },
      { name: 'Caffeine', strengthValue: '65', strengthUnit: 'mg' },
    ]);
  });

  it('preserves a three-ingredient central XLSX row through real XLSX creation/parsing', async () => {
    const blob = createXlsx({
      headers: ['sourceRecordKey', 'canonicalName', 'ingredients'],
      rows: [['CENT-COMBO-1', 'Combo XLSX', 'A|10|mg; B|20|mg; C|30|mg']],
    }, 'Central');
    const xlsx = new File([await blob.arrayBuffer()], 'combo.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const table = await parseSpreadsheet(xlsx);
    const rows = buildImportRows(table, {
      sourceRecordKey: 'sourceRecordKey',
      canonicalName: 'canonicalName',
      ingredients: 'ingredients',
    }, true);
    expect(rows[0]?.ingredients).toEqual([
      { name: 'A', strengthValue: '10', strengthUnit: 'mg' },
      { name: 'B', strengthValue: '20', strengthUnit: 'mg' },
      { name: 'C', strengthValue: '30', strengthUnit: 'mg' },
    ]);
  });
});
