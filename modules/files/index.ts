import { Module } from '@nestjs/common';
import { FILE_READER } from './contracts';
import { FilesService } from './backend/application/files.service';
import {
  FILE_REPOSITORY,
  STORAGE_PROVIDER,
} from './backend/application/file.repository';
import { PrismaFileRepository } from './backend/infrastructure/prisma-file.repository';
import { LocalStorageProvider } from './backend/infrastructure/local-storage.provider';
import { FilesController } from './backend/api/files.controller';

@Module({
  controllers: [FilesController],
  providers: [
    FilesService,
    { provide: FILE_REPOSITORY, useClass: PrismaFileRepository },
    { provide: STORAGE_PROVIDER, useClass: LocalStorageProvider },
    { provide: FILE_READER, useExisting: FilesService },
  ],
  exports: [FilesService, FILE_READER],
})
export class FilesModule {}
