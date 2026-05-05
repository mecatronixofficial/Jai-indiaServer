import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { FileRecord, FileDocument } from '../files/schemas/file.schema';
import { Folder, FolderDocument } from '../folders/schemas/folder.schema';
import { Role } from '../common/enums';

@Injectable()
export class SearchService {
  constructor(
    @InjectModel(FileRecord.name) private fileModel: Model<FileDocument>,
    @InjectModel(Folder.name) private folderModel: Model<FolderDocument>,
  ) {}

  async search(q: string, user: any, page = 1, limit = 20) {
    if (!q || q.trim().length < 2) {
      return { files: [], folders: [], total: 0 };
    }

    const regex = { $regex: q.trim(), $options: 'i' };

    const fileFilter: any = {
      isDeleted: false,
      $or: [
        { fileName: regex },
        { originalName: regex },
        { description: regex },
      ],
    };

    const folderFilter: any = {
      isDeleted: false,
      $or: [{ name: regex }, { description: regex }],
    };

    // Role-based filtering
    if (user.role === Role.USER) {
      fileFilter.$and = [
        {
          $or: [{ uploadedBy: user._id }, { sharedWith: user._id }],
        },
      ];
      folderFilter.createdBy = user._id;
    }

    const skip = (page - 1) * limit;

    const [files, folders] = await Promise.all([
      this.fileModel
        .find(fileFilter)
        .select('fileName originalName size uploadedBy folderId createdAt')
        .populate('uploadedBy', 'name email')
        .populate('folderId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      this.folderModel
        .find(folderFilter)
        .select('name createdBy createdAt')
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return {
      files,
      folders,
      total: files.length + folders.length,
      page,
      limit,
    };
  }
}
