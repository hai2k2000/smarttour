import { ArrayNotEmpty, IsArray, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const userStatuses = ['ACTIVE', 'INACTIVE', 'LOCKED'] as const;
const roleStatuses = ['ACTIVE', 'INACTIVE'] as const;

class AuthRecordDto {
  [key: string]: unknown;
}

class AuthPasswordDto extends AuthRecordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

class UserProfileDto extends AuthRecordDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  identityNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  maritalStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nationality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  ethnicity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  religion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  taxCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  rank?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  bankAccountNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  bankAccountName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  bankName?: string;
}

export class BootstrapAuthDto extends AuthPasswordDto {
  @IsEmail()
  @MaxLength(180)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  username?: string;

  @IsString()
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  bootstrapKey?: string;
}

export class LoginAuthDto extends AuthRecordDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  username?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  email?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class ChangePasswordDto extends AuthRecordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}

export class CreateAuthUserDto extends UserProfileDto {
  @IsEmail()
  @MaxLength(180)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  username?: string;

  @IsString()
  @MaxLength(180)
  name!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  roleCodes!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  branch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;
}

export class UpdateAuthUserDto extends UserProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @IsOptional()
  @IsIn(userStatuses)
  status?: typeof userStatuses[number];

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  roleCodes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  branch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;
}

export class CreateAuthRoleDto extends AuthRecordDto {
  @IsString()
  @MaxLength(120)
  code!: string;

  @IsString()
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  permissions!: string[];
}

export class UpdateAuthRoleDto extends AuthRecordDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsIn(roleStatuses)
  status?: typeof roleStatuses[number];

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  permissions?: string[];
}
