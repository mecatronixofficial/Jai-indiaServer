import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { UsersService } from './users.service';
import { UsersController } from './users.controller';

import { User, UserSchema } from './schemas/user.schema';
import { FileRecord, FileSchema } from '../files/schemas/file.schema';
import { TransactionsModule } from '../transactions/transactions.module'; // ✅ FIX: relative path

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: FileRecord.name, schema: FileSchema },
    ]),

    forwardRef(() => TransactionsModule), // ✅ FIX circular dependency
  ],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}