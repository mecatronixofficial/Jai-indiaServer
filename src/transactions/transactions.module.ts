import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';

import { Transaction, TransactionSchema } from './schemas/transaction.schema';
import { UsersModule } from '../users/users.module'; // ✅ FIX: use relative path

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Transaction.name, schema: TransactionSchema },
    ]),

    forwardRef(() => UsersModule), // ✅ FIX circular dependency
  ],
  providers: [TransactionsService],
  controllers: [TransactionsController],
  exports: [TransactionsService],
})
export class TransactionsModule {}