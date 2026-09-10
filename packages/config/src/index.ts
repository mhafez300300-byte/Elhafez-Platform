import { Global, Injectable, Module } from '@nestjs/common';
import { z } from 'zod';
import { ValidationError } from '@elhafez/errors';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),
  FILES_STORAGE_PATH: z.string().min(1).default('./storage/files'),
});
export type RuntimeConfig = z.infer<typeof envSchema>;

@Injectable()
export class RuntimeConfigService {
  readonly values: RuntimeConfig;
  constructor() {
    const result = envSchema.safeParse(process.env);
    if (!result.success) throw new ValidationError('Invalid runtime configuration', result.error.flatten());
    this.values = result.data;
  }
  get<K extends keyof RuntimeConfig>(key: K): RuntimeConfig[K] { return this.values[key]; }
}

@Global()
@Module({ providers: [RuntimeConfigService], exports: [RuntimeConfigService] })
export class RuntimeConfigModule {}
