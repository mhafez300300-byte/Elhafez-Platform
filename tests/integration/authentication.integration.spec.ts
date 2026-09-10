import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '@elhafez/database';
import { createTestApp, resetDatabase } from './test-app';

describe('authentication integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  beforeEach(() => resetDatabase(prisma));
  afterAll(() => app.close());

  it('rotates refresh tokens once, rejects replay, and revokes the session', async () => {
    const user = await prisma.coreUser.create({
      data: { email: 'auth@example.com', displayName: 'Auth User', platformAdmin: true },
    });
    await prisma.coreAuthCredential.create({
      data: {
        userId: user.id,
        login: user.email,
        passwordHash: await bcrypt.hash('StrongPassword123!', 12),
      },
    });

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ login: user.email, password: 'StrongPassword123!' })
      .expect(201);
    expect(login.body.accessToken).toBeTruthy();

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body.userId).toBe(user.id);

    const refreshed = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(201);
    expect(refreshed.body.refreshToken).not.toBe(login.body.refreshToken);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);

    const [raceA, raceB] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: refreshed.body.refreshToken }),
      request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: refreshed.body.refreshToken }),
    ]);
    expect([raceA.status, raceB.status].sort((a, b) => a - b)).toEqual([201, 401]);

    const finalRotation = raceA.status === 201 ? raceA : raceB;
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${finalRotation.body.accessToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${finalRotation.body.accessToken}`)
      .expect(401);
  });
});
