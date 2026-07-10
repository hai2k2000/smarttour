import { Allow, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const customerStatuses = ['ACTIVE', 'INACTIVE'] as const;
const customerKinds = ['INDIVIDUAL', 'COMPANY', 'AGENCY'] as const;
const careTaskStatuses = ['PENDING', 'DONE', 'CANCELLED'] as const;

class CustomerRequestDto {
  [key: string]: unknown;
}

class NamedConfigDto extends CustomerRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  name?: string;
}

export class CustomerTypeBodyDto extends NamedConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Allow()
  sortOrder?: unknown;
}

export class CustomerTagBodyDto extends CustomerRequestDto {
  @IsString()
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  color?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CustomerBulkTagDto extends CustomerRequestDto {
  @IsArray()
  @Allow()
  customerIds!: unknown[];

  @IsArray()
  @Allow()
  tagIds!: unknown[];
}

export class CustomerBulkUpdateDto extends CustomerRequestDto {
  @IsArray()
  @Allow()
  customerIds!: unknown[];

  @IsOptional()
  @IsArray()
  @Allow()
  tagIds?: unknown[];

  @IsOptional()
  @IsString()
  @MaxLength(180)
  owner?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  groupName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  branch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CustomerCampaignBodyDto extends NamedConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  channel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  startDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  endDate?: string;

  @IsOptional()
  @Allow()
  budget?: unknown;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CustomerImportRowsDto extends CustomerRequestDto {
  @IsArray()
  @Allow()
  rows!: unknown[];
}

export class CustomerBodyDto extends CustomerRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @IsOptional()
  @IsIn(customerStatuses)
  status?: typeof customerStatuses[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  typeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  kind?: typeof customerKinds[number] | string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  fullName?: string;

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
  @MaxLength(80)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  facebookUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  zaloUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  province?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  taxCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  tradingName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  companyAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  market?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  groupName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  campaignId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  owner?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  branch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  agencyType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  collaborator?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  latestComment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsBoolean()
  replaceNestedCollections?: boolean;

  @IsOptional()
  @IsArray()
  @Allow()
  tagIds?: unknown[];

  @IsOptional()
  @IsArray()
  @Allow()
  contacts?: unknown[];

  @IsOptional()
  @IsArray()
  @Allow()
  careTasks?: unknown[];

  @IsOptional()
  @IsArray()
  @Allow()
  comments?: unknown[];

  @IsOptional()
  @IsArray()
  @Allow()
  callLogs?: unknown[];

  @IsOptional()
  @IsArray()
  @Allow()
  opportunities?: unknown[];
}

export class CustomerMergeDto extends CustomerRequestDto {
  @IsString()
  @MaxLength(80)
  sourceId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  transferOwner?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  actor?: string;
}

export class CustomerTransferOwnerDto extends CustomerRequestDto {
  @IsString()
  @MaxLength(180)
  owner!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CustomerCommentDto extends CustomerRequestDto {
  @IsString()
  @MaxLength(2000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  fileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  fileUrl?: string;

  @IsOptional()
  @IsArray()
  @Allow()
  mentions?: unknown[];
}

export class CustomerCareTaskDto extends CustomerRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  channel?: string;

  @IsOptional()
  @IsIn(careTaskStatuses)
  status?: typeof careTaskStatuses[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  result?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  completedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  owner?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CustomerCallLogDto extends CustomerRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  caller?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  calledAt?: string;

  @IsOptional()
  @Allow()
  durationSec?: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  externalRef?: string;
}

export class CustomerOpportunityDto extends CustomerRequestDto {
  @IsString()
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  stage?: string;

  @IsOptional()
  @Allow()
  value?: unknown;

  @IsOptional()
  @Allow()
  probability?: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  expectedCloseAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  owner?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CustomerCareTaskUpdateDto extends CustomerRequestDto {
  @IsOptional()
  @IsIn(careTaskStatuses)
  status?: typeof careTaskStatuses[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  result?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  completedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
