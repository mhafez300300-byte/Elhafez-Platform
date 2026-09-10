import { Module } from '@nestjs/common';
import { USER_IDENTITY_READER } from './contracts';
import { UsersService } from './backend/application/users.service';
import { USER_REPOSITORY } from './backend/application/user.repository';
import { PrismaUserRepository } from './backend/infrastructure/prisma-user.repository';
import { UsersController } from './backend/api/users.controller';
@Module({controllers:[UsersController],providers:[UsersService,{provide:USER_REPOSITORY,useClass:PrismaUserRepository},{provide:USER_IDENTITY_READER,useExisting:UsersService}],exports:[UsersService,USER_IDENTITY_READER]})
export class UsersModule {}
