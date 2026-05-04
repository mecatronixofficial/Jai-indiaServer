import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { FilesCronService } from './files.cron.service';

import { FileRecord, FileSchema } from './schemas/file.schema';

import { R2Module } from '../r2/r2.module';
import { OtpModule } from '../otp/otp.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [
    // MongoDB schema registration
    MongooseModule.forFeature([
      { name: FileRecord.name, schema: FileSchema },
    ]),

    // External services
    R2Module,
    OtpModule,
    TransactionsModule,
  ],

  controllers: [FilesController],

  providers: [
    FilesService,
    FilesCronService,
  ],

  exports: [
    FilesService, // used by folders/search/other modules
  ],
})
export class FilesModule {}