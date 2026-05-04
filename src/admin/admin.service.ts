import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { User } from '../users/schemas/user.schema';
import { FileRecord } from '../files/schemas/file.schema';
import { Transaction } from '../transactions/schemas/transaction.schema';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(FileRecord.name) private fileModel: Model<FileRecord>,
    @InjectModel(Transaction.name) private txnModel: Model<Transaction>,
  ) {}

  // 👇 Example methods

  async getAllUsers() {
    return this.userModel.find().exec();
  }

  async getAllFiles() {
    return this.fileModel.find().exec();
  }

  async getAllTransactions() {
    return this.txnModel.find().exec();
  }

  async getDashboardStats() {
    const [users, files, transactions] = await Promise.all([
      this.userModel.countDocuments(),
      this.fileModel.countDocuments(),
      this.txnModel.countDocuments(),
    ]);

    return {
      totalUsers: users,
      totalFiles: files,
      totalTransactions: transactions,
    };
  }
}