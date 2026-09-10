import { InvariantViolationError } from '@elhafez/errors';
export class Company { constructor(readonly code: string, readonly name: string) { if (!/^[A-Z0-9-]{3,30}$/.test(code)) throw new InvariantViolationError('Invalid company code'); if (!name.trim()) throw new InvariantViolationError('Company name is required'); } }
