import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class SearchQueryDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  q: string;
}