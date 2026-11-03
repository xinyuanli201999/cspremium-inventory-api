import { PartialType } from '@nestjs/mapped-types';
import { Role, Status } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const lower = () =>
  Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );

export class CreateUserDto {
  @IsString() @MinLength(1) @MaxLength(100)
  name!: string;

  @lower() @IsEmail()
  email!: string;

  @IsString() @MinLength(8) @MaxLength(72)
  password!: string;

  @IsEnum(Role)
  role!: Role;

  @IsOptional() @IsEnum(Status)
  status?: Status;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {}

export class UserQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsEnum(Status) status?: Status;
}
