import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Survey } from './survey.schema';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { User } from '@prisma/client';
import { ClientProxy } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';

@Injectable()
export class SurveyService {
    constructor(@InjectModel(Survey.name) private readonly surveyModel: Model<Survey>,
        @Inject('SURVEY_SERVICE') private readonly client: ClientProxy,
        private readonly configService: ConfigService,
    ) { }

    async createSurvey(createSurveyDto: CreateSurveyDto, user: User): Promise<Survey> {
        this.client.emit('survey_changed', user);
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

    async updateSurvey(id: string, updateData: Partial<CreateSurveyDto>, user: User): Promise<Survey> {
        this.client.emit('survey_changed', user);
        const updatedSurvey = await this.surveyModel
            .findByIdAndUpdate(id, updateData, { new: true })
            .exec();
        if (!updatedSurvey) {
            throw new NotFoundException(`Survey with ID ${id} not found`);
        }
        return updatedSurvey;
    }

    async deleteSurvey(id: string, user: User): Promise<{ message: string }> {
        this.client.emit('survey_changed', user);
        const result = await this.surveyModel.deleteOne({ _id: id }).exec();
        if (result.deletedCount === 0) {
            throw new NotFoundException(`Survey with ID ${id} not found`);
        }
        return { message: 'Survey deleted successfully' };
    }

    async generateJavascriptCode(user: User) {
        try {
            const surveys = await this.surveyModel.find({ creatorEmail: user.email }).exec();
            if (!surveys) {
                throw new NotFoundException('Survey not found');
            }
            const storage = new Storage({
                // keyFilename: this.configService.get('GOOGLE_APPLICATION_CREDENTIALS'),
                projectId: this.configService.get('GCP_PROJECT_ID'),
            });
            const bucket = storage.bucket(this.configService.get('GCP_BUCKET_NAME'))
            const stream = await bucket.file(`embedded/${user.email}/latest/survey.js`).createWriteStream();
            const javascriptCode = `
                const surveys = ${JSON.stringify(surveys)};
                const element = document.createElement('script');
                element.src = "https://storage.cloud.google.com/paladin-surveys/engine/latest/bundle.js"
                setTimeout(() => { document.body.appendChild(element) }, 4000)
                
            `
            stream.end(javascriptCode);
        }
        catch(error: unknown) {
            console.log(error)
        }

    }
}
