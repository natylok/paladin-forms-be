import { IsNotEmpty, IsString, IsArray, ValidateNested, IsObject, IsEnum, IsOptional, IsBoolean, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { SurveyType, SurveyComponentType, TriggerVariableType } from '../survey.schema';

class DependsOnDto {
  @IsString()
  @IsNotEmpty()
  componentId: string;

  @IsString()
  @IsNotEmpty()
  condition: string;
}

class ComponentDto {
  @IsArray()
  @IsOptional()
  options: string[];

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsEnum(SurveyComponentType)
  type: SurveyComponentType;

  @IsOptional()
  @ValidateNested()
  @Type(() => DependsOnDto)
  dependsOn?: DependsOnDto;

  @IsBoolean()
  @IsOptional()
  required: boolean;
}

class StyleDto {
  @IsString()
  @IsNotEmpty()
  backgroundColor: string;

  @IsString()
  @IsNotEmpty()
  width: string;

  @IsString()
  @IsNotEmpty()
  height: string;

  @IsString()
  @IsOptional()
  logoUrl: string;
}

class TriggerVariableDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @IsEnum(TriggerVariableType)
  type: TriggerVariableType;

  @IsString()
  @IsNotEmpty()
  value: string;
}

class TriggerByActionDto {
  @IsString()
  @IsNotEmpty()
  elementSelector: string;

  @IsString()
  @IsNotEmpty()
  action: string;
}

class SurveySettingsDto {
  @IsNumber()
  @IsOptional()
  showOnPercent?: number;

  @IsNumber()
  @IsOptional()
  usersWhoDeclined?: number;

  @IsNumber()
  @IsOptional()
  usersWhoSubmitted?: number;

  @IsNumber()
  @IsOptional()
  usersOnSessionInSeconds?: number;

  @IsNumber()
  @IsOptional()
  minTimeOnSiteSeconds?: number;

  @IsArray()
  @IsOptional()
  excludeUrls?: string[];

  @IsArray()
  @IsOptional()
  includeUrls?: string[];

  @IsNumber()
  @IsOptional()
  maxAttemptsPerUser?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => TriggerByActionDto)
  triggerByAction?: TriggerByActionDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TriggerVariableDto)
  triggerByVariable?: TriggerVariableDto;
}

export class CreateSurveyDto {
  @IsNotEmpty()
  @IsString()
  surveyName: string;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComponentDto)
  components: ComponentDto[];

  @IsNotEmpty()
  @ValidateNested()
  @Type(() => StyleDto)
  style: StyleDto;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => SurveySettingsDto)
  settings?: SurveySettingsDto;

  @IsEnum(SurveyType)
  @IsOptional()
  surveyType?: SurveyType;
}
