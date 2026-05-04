import {
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/* =========================
   CREATE FOLDER
========================= */
export class CreateFolderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsMongoId()
  @IsOptional()
  parentId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}

/* =========================
   UPDATE FOLDER
========================= */
export class UpdateFolderDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}

/* =========================
   MOVE FOLDER
========================= */
export class MoveFolderDto {
  /**
   * null = move to root
   * valid ObjectId = move under another folder
   */
  @IsMongoId()
  @IsOptional()
  parentId?: string | null;
}