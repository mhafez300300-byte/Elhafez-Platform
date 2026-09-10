export interface SpreadsheetIngredient {
  name: string;
  strengthValue?: string;
  strengthUnit?: string;
}

export function parseIngredientCell(value: string): SpreadsheetIngredient[] {
  const raw = value.trim();
  if (!raw) return [];
  if (raw.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('Ingredients JSON is invalid');
    }
    if (!Array.isArray(parsed)) throw new Error('Ingredients JSON must be an array');
    return parsed.map((item, index) => {
      if (!item || typeof item !== 'object') throw new Error(`Ingredient ${index + 1} must be an object`);
      const record = item as Record<string, unknown>;
      const name = String(record.name ?? '').trim();
      if (!name) throw new Error(`Ingredient ${index + 1} name is required`);
      const strengthValue = String(record.strengthValue ?? '').trim();
      const strengthUnit = String(record.strengthUnit ?? '').trim();
      return {
        name,
        ...(strengthValue ? { strengthValue } : {}),
        ...(strengthUnit ? { strengthUnit } : {}),
      };
    });
  }
  return raw.split(/\s*;\s*/).filter(Boolean).map((part, index) => {
    const [namePart = '', strengthPart = '', unitPart = '', ...extra] = part.split('|');
    if (extra.length) throw new Error(`Ingredient ${index + 1} has too many pipe-separated fields`);
    const name = namePart.trim();
    if (!name) throw new Error(`Ingredient ${index + 1} name is required`);
    const strengthValue = strengthPart.trim();
    const strengthUnit = unitPart.trim();
    return {
      name,
      ...(strengthValue ? { strengthValue } : {}),
      ...(strengthUnit ? { strengthUnit } : {}),
    };
  });
}
