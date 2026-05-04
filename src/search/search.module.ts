import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { SearchController } from './search.controller';
import { SearchService } from './search.service';

import { FileRecord, FileSchema } from '../files/schemas/file.schema';
import { Folder, FolderSchema } from '../folders/schemas/folder.schema';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FileRecord.name, schema: FileSchema },
      { name: Folder.name, schema: FolderSchema },
    ]),
    UsersModule, // 👈 for permission-aware search
  ],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService], // 👈 reusable
})
export class SearchModule {}