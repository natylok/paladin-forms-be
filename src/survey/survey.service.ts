import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Survey, TriggerVariableType } from './survey.schema';
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
        const survey = await this.surveyModel.findOne({surveyId: id}).exec();
        if (!survey) {
            throw new NotFoundException(`Survey with ID ${id} not found`);
        }
        return survey;
    }

    private cleanData(data: any): any {
        const cleanData = JSON.parse(JSON.stringify(data));
        
        const removeObjectIds = (obj: any) => {
            if (!obj) return obj;
            
            if (obj._id) delete obj._id;
            if (obj.$oid) delete obj.$oid;
            
            if (Array.isArray(obj)) {
                return obj.map(item => removeObjectIds(item));
            }
            
            if (typeof obj === 'object') {
                Object.keys(obj).forEach(key => {
                    obj[key] = removeObjectIds(obj[key]);
                });
            }
            
            return obj;
        };

        return removeObjectIds(cleanData);
    }

    private validateTriggerVariable(triggerByVariable: any): void {
        if (!triggerByVariable) return;

        const validTypes = Object.values(TriggerVariableType);
        if (!validTypes.includes(triggerByVariable.type)) {
            throw new Error(`Invalid triggerByVariable.type. Must be one of: ${validTypes.join(', ')}`);
        }
    }

    private prepareSettingsUpdate(settings: any): { updateQuery: any, unsetQuery: any } {
        const updateQuery: any = {};
        const unsetQuery: any = {};

        if (!settings) return { updateQuery, unsetQuery };

        const { triggerByVariable, triggerByAction, ...restSettings } = settings;
        this.validateTriggerVariable(triggerByVariable);

        // Handle triggerByVariable
        if (triggerByVariable) {
            updateQuery['settings.triggerByVariable'] = {
                key: triggerByVariable.key,
                type: triggerByVariable.type,
                value: triggerByVariable.value
            };
        } else {
            unsetQuery['settings.triggerByVariable'] = 1;
        }

        // Handle triggerByAction
        if (triggerByAction) {
            updateQuery['settings.triggerByAction'] = {
                action: triggerByAction.action,
                elementSelector: triggerByAction.elementSelector
            };
        } else {
            unsetQuery['settings.triggerByAction'] = 1;
        }

        // Handle other settings
        Object.keys(restSettings).forEach(key => {
            updateQuery[`settings.${key}`] = restSettings[key];
        });

        return { updateQuery, unsetQuery };
    }

    private prepareUpdateOperation(updateObject: any): any {
        const updateQuery: any = {};
        const unsetQuery: any = {};

        // Handle non-settings fields
        Object.keys(updateObject).forEach(key => {
            if (key !== 'settings') {
                updateQuery[key] = updateObject[key];
            }
        });

        // Handle settings
        const { updateQuery: settingsUpdateQuery, unsetQuery: settingsUnsetQuery } = 
            this.prepareSettingsUpdate(updateObject.settings);

        return {
            ...(Object.keys(updateQuery).length > 0 && { $set: updateQuery }),
            ...(Object.keys(settingsUpdateQuery).length > 0 && { $set: settingsUpdateQuery }),
            ...(Object.keys(settingsUnsetQuery).length > 0 && { $unset: settingsUnsetQuery })
        };
    }

    async updateSurvey(id: string, updateData: Partial<CreateSurveyDto>, user: User): Promise<Survey> {
        this.client.emit('survey_changed', user);
        
        // Get and clean the update data
        const surveyData = updateData['survey'] || updateData;
        const cleanedData = this.cleanData(surveyData);

        // Prepare the update object with defaults
        const updateObject = {
            ...cleanedData,
            components: cleanedData.components || [],
            style: cleanedData.style || {}
        };

        // Prepare and execute the update operation
        const updateOperation = this.prepareUpdateOperation(updateObject);
        
        const updatedSurvey = await this.surveyModel
            .findOneAndUpdate(
                { surveyId: id },
                updateOperation,
                { 
                    new: true, 
                    runValidators: true,
                    strict: false
                }
            )
            .exec();

        if (!updatedSurvey) {
            throw new NotFoundException(`Survey with ID ${id} not found`);
        }

        return updatedSurvey;
    }

    async deleteSurvey(id: string, user: User): Promise<{ message: string }> {
        this.client.emit('survey_changed', user);
        const result = await this.surveyModel.deleteOne({ surveyId: id }).exec();
        if (result.deletedCount === 0) {
            throw new NotFoundException(`Survey with ID ${id} not found`);
        }
        return { message: 'Survey deleted successfully' };
    }

    async getSurveysByUser(user: User) {
        return await this.surveyModel.find({ creatorEmail: user.email }).lean().exec();
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
            const stream = await bucket.file(`embedded/${user.email}/latest/embed.js`).createWriteStream();
            const javascriptCode = `
                window.paladinSurveys = ${JSON.stringify(surveys)};
                const element = document.createElement('script');
                element.src = "https://storage.cloud.google.com/paladin-surveys/engine/latest/embed.js";
                setTimeout(() => { document.body.appendChild(element) }, 4000);
                window.PALADIN_SURVEY_URL = "https://storage.cloud.google.com/paladin-surveys/surveys/v1/index.html";
            `
            stream.end(javascriptCode);
        }
        catch(error: unknown) {
            console.log(error)
        }

    }
}
