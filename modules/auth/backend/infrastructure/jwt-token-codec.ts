import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { RuntimeConfigService } from '@elhafez/config';
import type { TokenCodec, TokenPayload } from '../application/auth.repository';

@Injectable()
export class JwtTokenCodec implements TokenCodec {
  readonly accessTtl: number;
  readonly refreshTtl: number;

  constructor(private readonly config: RuntimeConfigService) {
    this.accessTtl = config.get('ACCESS_TOKEN_TTL_SECONDS');
    this.refreshTtl = config.get('REFRESH_TOKEN_TTL_SECONDS');
  }

  signAccess(payload: TokenPayload): string {
    return jwt.sign(payload, this.config.get('JWT_ACCESS_SECRET'), {
      algorithm: 'HS256',
      expiresIn: this.accessTtl,
      jwtid: randomUUID(),
    });
  }

  signRefresh(payload: TokenPayload): string {
    return jwt.sign(payload, this.config.get('JWT_REFRESH_SECRET'), {
      algorithm: 'HS256',
      expiresIn: this.refreshTtl,
      jwtid: randomUUID(),
    });
  }

  verifyAccess(token: string): TokenPayload {
    const payload = jwt.verify(token, this.config.get('JWT_ACCESS_SECRET'), {
      algorithms: ['HS256'],
    }) as TokenPayload;
    if (payload.typ !== 'access') throw new Error('Wrong token type');
    return payload;
  }

  verifyRefresh(token: string): TokenPayload {
    const payload = jwt.verify(token, this.config.get('JWT_REFRESH_SECRET'), {
      algorithms: ['HS256'],
    }) as TokenPayload;
    if (payload.typ !== 'refresh') throw new Error('Wrong token type');
    return payload;
  }
}
