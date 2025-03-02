import { IsNotEmpty, IsString, IsArray, ValidateNested, IsObject, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

class ComponentDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsEnum(['1to5stars', 'textbox', '1to10', 'input', '1to5faces', 'radio buttons'])
  type: string;
}

export class CreateSurveyDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComponentDto)
  components: ComponentDto[];

  @IsNotEmpty()
  @IsObject()
  style: {
    backgroundColor: string;
  };

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
  
}
