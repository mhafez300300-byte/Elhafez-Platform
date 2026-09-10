export type EntityId = string;
export type IsoDateTime = string;

export interface PageRequest {
  limit?: number;
  offset?: number;
}

export interface PageResult<T> {
  items: T[];
  total: number;
}

export const nowIso = (): IsoDateTime => new Date().toISOString();
