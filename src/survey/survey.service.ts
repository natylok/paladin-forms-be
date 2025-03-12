import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Survey, TriggerVariableType, SurveyType } from './survey.schema';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { User } from '@prisma/client';
import { ClientProxy } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';
import { LoggerService } from '../logger/logger.service';

@Injectable()
export class SurveyService {
    constructor(
        @InjectModel(Survey.name) private readonly surveyModel: Model<Survey>,
        @Inject('SURVEY_SERVICE') private readonly client: ClientProxy,
        private readonly configService: ConfigService,
        private readonly logger: LoggerService
    ) {
        // Log RabbitMQ connection status
        this.client.connect().then(() => {
            this.logger.log('Successfully connected to RabbitMQ');
        }).catch(err => {
            this.logger.error('Failed to connect to RabbitMQ', err.stack);
        });
    }

    async createSurvey(createSurveyDto: CreateSurveyDto, user: User): Promise<Survey> {
        this.logger.log('Creating new survey', { user: user.email, dto: createSurveyDto });
        try {
            await this.client.emit('survey_changed', user).toPromise();
            this.logger.debug('Successfully emitted survey_changed event', { user: user.email });
        } catch (error) {
            this.logger.error('Failed to emit survey_changed event', error instanceof Error ? error.stack : undefined, { user: user.email });
        }
        const createdSurvey = new this.surveyModel({ ...createSurveyDto, creatorEmail: user.email });
        const result = await createdSurvey.save();
        this.logger.log('Survey created successfully', { surveyId: result.surveyId, user: user.email });
        return result;
    }

    async getSurveys(user: User): Promise<Survey[]> {
        this.logger.log(`Fetching all surveys for user ${user.email}`);
        return this.surveyModel.find().exec();
    }

    async getSurveyById(id: string): Promise<Survey> {
        this.logger.log(`Fetching survey by ID ${id}`);
        const survey = await this.surveyModel.findOne({surveyId: id}).exec();
        if (!survey) {
            this.logger.error(`Survey not found with ID ${id}`);
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

    private validateTriggerByVariable(triggerByVariable: any, user: User) {
        const validTypes = Object.values(TriggerVariableType);
        if (!validTypes.includes(triggerByVariable?.type)) {
            const error = `Invalid triggerByVariable.type. Must be one of: ${validTypes.join(', ')}`;
            this.logger.error(`${error} for user ${user.email}`);
            throw new Error(error);
        }
    }

    private validateSurveyType(surveyType: SurveyType, user: User) {
        const validTypes = Object.values(SurveyType);
        if (!validTypes.includes(surveyType)) {
            const error = `Invalid surveyType. Must be one of: ${validTypes.join(', ')}`;
            this.logger.error(`${error} for user ${user.email}`);
            throw new Error(error);
        }
    }

    private prepareSettingsUpdate(settings: any, user: User): { updateQuery: any, unsetQuery: any } {
        this.logger.debug(`Preparing settings update for user ${user.email}`);
        const updateQuery: any = {};
        const unsetQuery: any = {};

        if (!settings) return { updateQuery, unsetQuery };

        const { triggerByVariable, triggerByAction, ...restSettings } = settings;
        if(triggerByVariable){
            this.validateTriggerByVariable(triggerByVariable, user);
        }
       
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

        this.logger.debug('Settings update prepared', { updateQuery, unsetQuery, user: user.email });
        return { updateQuery, unsetQuery };
    }

    private prepareUpdateOperation(updateObject: any, user: User): any {
        this.logger.debug(`Preparing update operation for user ${user.email}`);
        const updateQuery: any = {};
        const unsetQuery: any = {};

        // Handle surveyType first
        if (updateObject.surveyType !== undefined) {
            this.logger.debug('Processing surveyType', { surveyType: updateObject.surveyType, user: user.email });
            this.validateSurveyType(updateObject.surveyType, user);
            updateQuery.surveyType = updateObject.surveyType;
        }

        // Handle non-settings fields
        Object.keys(updateObject).forEach(key => {
            if (key !== 'settings' && key !== 'surveyType') {
                updateQuery[key] = updateObject[key];
            }
        });

        // Handle settings
        const { updateQuery: settingsUpdateQuery, unsetQuery: settingsUnsetQuery } = 
            this.prepareSettingsUpdate(updateObject.settings, user);

        // Create the final update object
        const finalUpdate: any = {};

        // Add $set operations if they exist
        if (Object.keys(updateQuery).length > 0 || Object.keys(settingsUpdateQuery).length > 0) {
            finalUpdate.$set = {
                ...updateQuery,
                ...settingsUpdateQuery
            };
        }

        // Add $unset operations if they exist
        if (Object.keys(settingsUnsetQuery).length > 0) {
            finalUpdate.$unset = settingsUnsetQuery;
        }

        this.logger.debug('Update operation prepared', { finalUpdate, user: user.email });
        return finalUpdate;
    }

    async updateSurvey(id: string, updateData: Partial<CreateSurveyDto>, user: User): Promise<Survey> {
        this.logger.log(`Updating survey ${id} for user ${user.email}`);
        this.client.emit('survey_changed', user);
        
        // Get and clean the update data
        const surveyData = updateData['survey'] || updateData;
        this.logger.debug(`Original update data for survey ${id} and user ${user.email}`);
        
        const cleanedData = this.cleanData(surveyData);
        this.logger.debug(`Cleaned data for survey ${id} and user ${user.email}`);

        // Prepare the update object with defaults
        const updateObject = {
            ...cleanedData,
            settings: {
                ...cleanedData.settings,
                showOnPercent: cleanedData.settings?.showOnPercent ?? 100,
                usersWhoDeclined: cleanedData.settings?.usersWhoDeclined ?? 30,
                usersWhoSubmitted: cleanedData.settings?.usersWhoSubmitted ?? 30,
                usersOnSessionInSeconds: cleanedData.settings?.usersOnSessionInSeconds ?? 30,
                minTimeOnSiteSeconds: cleanedData.settings?.minTimeOnSiteSeconds ?? 0,
                excludeUrls: cleanedData.settings?.excludeUrls ?? [],
                includeUrls: cleanedData.settings?.includeUrls ?? [],
                maxAttemptsPerUser: cleanedData.settings?.maxAttemptsPerUser ?? 3,
            },
        };

        if (cleanedData.surveyType) {
            updateObject.surveyType = cleanedData.surveyType;
            this.logger.debug(`Setting surveyType to ${cleanedData.surveyType} for user ${user.email}`);
        }

        // Prepare and execute the update operation
        const updateOperation = this.prepareUpdateOperation(updateObject, user);
        this.logger.debug(`Final update operation for survey ${id} and user ${user.email}`);
        
        const updatedSurvey = await this.surveyModel
            .findOneAndUpdate(
                { surveyId: id },
                updateOperation,
                { new: true, runValidators: true }
            )
            .exec();

        if (!updatedSurvey) {
            this.logger.error(`Survey not found during update with ID ${id} for user ${user.email}`);
            throw new NotFoundException(`Survey with ID ${id} not found`);
        }

        this.logger.log(`Survey ${id} updated successfully for user ${user.email}`);
        return updatedSurvey;
    }

    async deleteSurvey(id: string, user: User): Promise<{ message: string }> {
        this.logger.log(`Deleting survey ${id} for user ${user.email}`);
        this.client.emit('survey_changed', user);
        const result = await this.surveyModel.deleteOne({ surveyId: id }).exec();
        if (result.deletedCount === 0) {
            this.logger.error(`Survey not found during deletion with ID ${id} for user ${user.email}`);
            throw new NotFoundException(`Survey with ID ${id} not found`);
        }
        this.logger.log(`Survey ${id} deleted successfully for user ${user.email}`);
        return { message: 'Survey deleted successfully' };
    }

    async getSurveysByUser(user: User) {
        this.logger.log(`Fetching surveys for user ${user.email}`);
        return await this.surveyModel.find({ creatorEmail: user.email }).lean().exec();
    }

    async generateJavascriptCode(user: User) {
        this.logger.log(`Generating JavaScript code for user ${user.email}`);
        try {
            const surveys = await this.surveyModel.find({ creatorEmail: user.email }).exec();
            if (!surveys) {
                this.logger.error(`No surveys found for user ${user.email}`);
                throw new NotFoundException('Survey not found');
            }
            const storage = new Storage({
                projectId: this.configService.get('GCP_PROJECT_ID'),
            });
            const bucket = storage.bucket(this.configService.get('GCP_BUCKET_NAME'));
            const filePath = `embedded/${user.email}/latest/embed.js`;
            this.logger.debug(`Writing JavaScript code to storage at ${filePath} for user ${user.email}`);
            
            const stream = await bucket.file(filePath).createWriteStream();
            const javascriptCode = `
                window.paladinSurveys = ${JSON.stringify(surveys)};
                const element = document.createElement('script');
                element.src = "https://storage.cloud.google.com/paladin-surveys/engine/latest/embed.js";
                setTimeout(() => { document.body.appendChild(element) }, 4000);
                window.PALADIN_SURVEY_URL = "https://storage.cloud.google.com/paladin-surveys/surveys/v1/index.html";
            `;
            stream.end(javascriptCode);
            this.logger.log(`JavaScript code generated successfully for user ${user.email}`);
        }
        catch(error: unknown) {
            this.logger.error(`Error generating JavaScript code for user ${user.email}: ${error instanceof Error ? error.stack : 'Unknown error'}`);
            console.log(error);
        }
    }
}
