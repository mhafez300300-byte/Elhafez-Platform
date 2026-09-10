import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const permissions: Array<[string,string]> = [
  ['core.auth.manage','Manage authentication credentials'],
  ['core.users.read','Read users'],['core.users.manage','Manage users'],
  ['core.roles.read','Read roles'],['core.roles.manage','Manage roles'],
  ['core.permissions.read','Read permissions'],['core.permissions.manage','Manage permissions and assignments'],
  ['core.companies.read','Read companies'],['core.companies.manage','Manage companies'],
  ['core.branches.read','Read branches'],['core.branches.manage','Manage branches'],
  ['core.audit.read','Read audit log'],['core.files.read','Read files'],['core.files.manage','Manage files'],
  ['core.notifications.manage','Send notifications'],
];

async function main(): Promise<void> {
  for (const [key, description] of permissions) {
    await prisma.corePermission.upsert({ where: { key }, create: { key, description }, update: { description } });
  }
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email && !password) return;
  if (!email || !password || password.length < 12) throw new Error('BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (12+ chars) must be supplied together');
  const user = await prisma.coreUser.upsert({ where: { email }, create: { email, displayName: 'Platform Owner', platformAdmin: true }, update: { platformAdmin: true, status: 'ACTIVE' } });
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.coreAuthCredential.upsert({ where: { userId: user.id }, create: { userId: user.id, login: email, passwordHash }, update: { login: email, passwordHash } });
}
main().finally(() => prisma.$disconnect());
