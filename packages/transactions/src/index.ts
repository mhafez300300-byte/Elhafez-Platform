import { Global, Injectable, Module } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@elhafez/database';

export type TransactionContext = Prisma.TransactionClient;

@Injectable()
export class TransactionManager {
  constructor(private readonly prisma: PrismaService) {}
  run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => work(tx));
  }
}

@Global()
@Module({ providers: [TransactionManager], exports: [TransactionManager] })
export class TransactionsModule {}
