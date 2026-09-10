import { DynamicModule, Module, ModuleMetadata } from '@nestjs/common';
import { AuthService } from './backend/application/auth.service';
import { AUTH_REPOSITORY, PASSWORD_HASHER, TOKEN_CODEC } from './backend/application/auth.repository';
import { PrismaAuthRepository } from './backend/infrastructure/prisma-auth.repository';
import { BcryptPasswordHasher } from './backend/infrastructure/bcrypt-password-hasher';
import { JwtTokenCodec } from './backend/infrastructure/jwt-token-codec';
import { AccessTokenGuard } from './backend/api/access-token.guard';
import { AuthController } from './backend/api/auth.controller';
export { AccessTokenGuard } from './backend/api/access-token.guard';
export { AuthService } from './backend/application/auth.service';
@Module({})
export class AuthModule { static register(imports:NonNullable<ModuleMetadata['imports']>):DynamicModule{return{module:AuthModule,imports,controllers:[AuthController],providers:[AuthService,AccessTokenGuard,{provide:AUTH_REPOSITORY,useClass:PrismaAuthRepository},{provide:PASSWORD_HASHER,useClass:BcryptPasswordHasher},{provide:TOKEN_CODEC,useClass:JwtTokenCodec}],exports:[AuthService,AccessTokenGuard]};} }
