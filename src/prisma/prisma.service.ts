import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super({
      datasourceUrl: process.env.DATABASE_URL,
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async enableShutdownHooks(app: any) {
    this.$on('beforeExit' as any, async () => {
      await app.close();
    });
  }
}
