import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Survey } from './survey.schema';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { User } from '@prisma/client';

@Injectable()
export class SurveyService {
    constructor(@InjectModel(Survey.name) private readonly surveyModel: Model<Survey>) { }

    async createSurvey(createSurveyDto: CreateSurveyDto, user: User): Promise<Survey> {
        const createdSurvey = new this.surveyModel({ ...createSurveyDto, creatorEmail: user.email });
        return createdSurvey.save();
    }

    async getSurveys(): Promise<Survey[]> {
        return this.surveyModel.find().exec();
    }

    async getSurveyById(id: string): Promise<Survey> {
        const survey = await this.surveyModel.findById(id).exec();
        if (!survey) {
            throw new NotFoundException(`Survey with ID ${id} not found`);
        }
        return survey;
    }

    async updateSurvey(id: string, updateData: Partial<CreateSurveyDto>): Promise<Survey> {
        const updatedSurvey = await this.surveyModel
            .findByIdAndUpdate(id, updateData, { new: true })
            .exec();
        if (!updatedSurvey) {
            throw new NotFoundException(`Survey with ID ${id} not found`);
        }
        return updatedSurvey;
    }

    async deleteSurvey(id: string): Promise<{ message: string }> {
        const result = await this.surveyModel.deleteOne({ _id: id }).exec();
        if (result.deletedCount === 0) {
            throw new NotFoundException(`Survey with ID ${id} not found`);
        }
        return { message: 'Survey deleted successfully' };
    }
}
