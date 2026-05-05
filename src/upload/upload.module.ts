import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';

import { R2Module } from '../r2/r2.module';
import { UsersModule } from '../users/users.module';
import { TransactionsModule } from '../transactions/transactions.module';

import { FileRecord, FileSchema } from '../files/schemas/file.schema';

@Module({
  imports: [
    R2Module,
    UsersModule, // 👈 for quota validation
    TransactionsModule, // 👈 for logging uploads

    MongooseModule.forFeature([
      { name: FileRecord.name, schema: FileSchema }, // 👈 store metadata
    ]),
  ],
  providers: [UploadService],
  controllers: [UploadController],
  exports: [UploadService],
})
export class UploadModule {}
