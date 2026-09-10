import type { UserView } from '../contracts';
export const createUsersClient = (baseUrl: string, token: () => string | null) => ({
  async list(): Promise<UserView[]> { const r = await fetch(`${baseUrl}/users`, { headers: { Authorization: `Bearer ${token() ?? ''}` } }); if (!r.ok) throw new Error('Failed to load users'); return r.json() as Promise<UserView[]>; },
});
