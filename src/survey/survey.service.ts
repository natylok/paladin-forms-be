import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { CreateSurveyDto } from './dto/create-survey.dto';
import { User, UserType } from '@prisma/client';
import { ClientProxy } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import { LoggerService } from '../logger/logger.service';
import { Survey } from './survey.schema';
import { TriggerVariableType, SurveyType, ISurvey } from '@natylok/paladin-forms-common';
import { TranslationLanguages } from 'src/consts/translations';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from 'src/redis/redis.service';

@Injectable()
export class SurveyService {
    constructor(
        @InjectModel(Survey.name) private readonly surveyModel: Model<Survey>,
        @Inject('SURVEY_SERVICE') private readonly client: ClientProxy,
        @Inject('TRANSLATION_SERVICE') private readonly translationClient: ClientProxy,
        private readonly configService: ConfigService,
        private readonly logger: LoggerService,
        private readonly redisService: RedisService
    ) {
        // Log RabbitMQ connection status
        this.client.connect().then(() => {
            this.logger.log('Successfully connected to RabbitMQ');
        }).catch(err => {
            this.logger.error('Failed to connect to RabbitMQ', err.stack);
        });
    }

    async createLinkToSurvey(user: User, survey: ISurvey) {
        this.logger.debug('Creating html survey for customer')
        const surveyAsString = JSON.stringify(survey);
        const storage = new Storage({
            projectId: this.configService.get('GCP_PROJECT_ID'),
        });
        const bucket = storage.bucket(this.configService.get('GCP_BUCKET_NAME'));
        const html = `
            <!DOCTYPE html>
            <html>
                <head>
                    <script>
                        window.PALADIN_FORM_SURVEY = ${surveyAsString};
                    </script>
                    <script src="https://form.paladin-forms.com/surveys/v1/bundle.js">
                    </script>
                </head>
                <body>
                    <div id="app"> 
                </body>
            </html>
        `
        this.logger.debug('Writing html survey to storage')
        const filePath = `customer-surveys/${user.customerId ?? user.email}/${survey.surveyId}`;
        const stream = bucket.file(filePath).createWriteStream({
            metadata: {
                contentType: 'text/html',
            },
            resumable: false
        });
        stream.end(Buffer.from(html, 'utf8'));
        await new Promise((resolve, reject) => {
            stream.on('finish', resolve);
            stream.on('error', reject);
        });
        this.logger.debug('Html survey written to storage')
    }

    async viewSurvey(surveyId: string) {
        const survey = await this.surveyModel.findOne({ surveyId: surveyId }).exec();
        if (!survey) {
            throw new NotFoundException(`Survey with ID ${surveyId} not found`);
        }
        survey.numOfViews++;
        await survey.save();
        return survey;
    }

    async createSurvey(createSurveyDto: CreateSurveyDto, user: User): Promise<Survey> {
        this.logger.log('Creating new survey', { user: user.email, dto: createSurveyDto });
        if (user.customerId) {
            createSurveyDto.customerId = user.customerId;
        }
        const createdSurvey = new this.surveyModel({ ...createSurveyDto, creatorEmail: user.email, createdAt: new Date().toISOString() });
        this.logger.log('Survey created successfully', { surveyId: createdSurvey.surveyId, user: user.email });
        const result = await createdSurvey.save();
        this.logger.log('Survey created successfully', { surveyId: result.surveyId, user: user.email });
        return createdSurvey;
    }

    async getSurveys(user: User): Promise<Survey[]> {
        if (user.customerId) {
            this.logger.log(`Fetching all surveys for user ${user.email} ${user.customerId}`);
            return this.surveyModel.find({ customerId: user.customerId }).exec();
        }
        this.logger.log(`Fetching all surveys for user ${user.email}`);
        return this.surveyModel.find({ creatorEmail: user.email }).exec();
    }

    async getSurveyById(id: string, user: User): Promise<Survey> {
        try {
            this.logger.log(`Fetching survey by ID ${id}`);
            const filter = user.customerId ? { customerId: user.customerId } : { creatorEmail: user.email };
            const survey = await this.surveyModel.findOne({ surveyId: id, ...filter }).exec();
            if (!survey) {
                this.logger.error(`Survey not found with ID ${id}`);
                throw new NotFoundException(`Survey with ID ${id} not found`);
            }
            this.logger.log(`Survey ${id} fetched successfully`);
            return survey;
        } catch (error) {
            this.logger.error(
                'Error fetching survey by ID',
                error instanceof Error ? error.stack : undefined,
                { surveyId: id }
            );
            throw error;
        }
    }

    async publishSurvey(id: string, user: User) {
        const survey = await this.getSurveyById(id, user);
        if (!survey) {
            throw new NotFoundException(`Survey with ID ${id} not found`);
        }
        this.client.emit('publish_survey', { user, surveyId: survey.surveyId }).toPromise();
        return survey;
    }

    async handlePublishSurvey(surveyId: string, user: User) {
        const survey = await this.getSurveyById(surveyId, user);
        this.logger.debug('Handling publish survey', { surveyId, user: user.email });
        await this.generateJavascriptCode(user);
        await this.createLinkToSurvey(user, survey);
    }

    async getTranslateStatus(id: string) {
        const redisQueueName = id
        const redisClient = this.redisService.getClient();
        const status = await redisClient.get(redisQueueName);
        if (status === 'completed') {
            redisClient.del(redisQueueName);
        }
        return status;
    }

    async translateSurveys(surveyIds: string[], user: User, sourceLang: TranslationLanguages, targetLangs: TranslationLanguages[]) {
        const redisQueueName = `survey_translation_${uuidv4()}`;
        await this.translationClient.emit('survey_translation_requested', { user: user, surveyIds: surveyIds, sourceLang: sourceLang, targetLangs: targetLangs, redisQueueName }).toPromise();
        return redisQueueName;
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
        if (triggerByVariable) {
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
        const filter = user.customerId ? { customerId: user.customerId } : { creatorEmail: user.email };
        const survey = await this.surveyModel.findOne({ surveyId: id, ...filter }).exec();
        if (!survey) {
            this.logger.error(`Survey not found with ID ${id} for user ${user.email}`);
            throw new NotFoundException(`Survey with ID ${id} not found`);
        }
        this.logger.log(`Updating survey ${id} for user ${user.email}`);

        // Get and clean the update data
        const surveyData = updateData;
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
        const filter = user.customerId ? { customerId: user.customerId } : { creatorEmail: user.email };
        this.logger.log(`Deleting survey ${id} for user ${user.email}`);
        const result = await this.surveyModel.deleteOne({ surveyId: id, ...filter }).exec();
        if (result.deletedCount === 0) {
            this.logger.error(`Survey not found during deletion with ID ${id} for user ${user.email}`);
            throw new NotFoundException(`Survey with ID ${id} not found`);
        }
        this.client.emit('survey_changed', user);
        this.logger.log(`Survey ${id} deleted successfully for user ${user.email}`);
        return { message: 'Survey deleted successfully' };
    }

    async getSurveysByUser(user: User) {
        this.logger.log(`Fetching surveys for user ${user.email}`);
        const filter = user.customerId ? { customerId: user.customerId } : { creatorEmail: user.email };
        return await this.surveyModel.find({ ...filter }).lean().exec();
    }

    async generateJavascriptCode(user: User) {
        this.logger.log(`Generating JavaScript code for user ${user.email}`);
        try {
            const filter = user.customerId ? { customerId: user.customerId } : { creatorEmail: user.email };
            const surveys = await this.surveyModel.find({ ...filter, isActive: true }).exec();
            if (!surveys) {
                this.logger.error(`No surveys found for user ${user.email} ${user.customerId}`);
                throw new NotFoundException('Survey not found');
            }
            const storage = new Storage({
                projectId: this.configService.get('GCP_PROJECT_ID'),
            });
            const bucket = storage.bucket(this.configService.get('GCP_BUCKET_NAME'));
            const filePath = `embedded/${user.email}/latest/embed.js`;
            this.logger.debug(`Writing JavaScript code to storage at ${filePath} for user ${user.email}`);

            const stream = await bucket.file(filePath).createWriteStream({
                metadata: {
                    contentType: 'application/javascript; charset=utf-8',
                    contentEncoding: 'utf-8',
                },
                resumable: false
            });

            // Ensure proper encoding of Hebrew characters in JSON
            const surveysJson = JSON.stringify(surveys, (key, value) => {
                if (typeof value === 'string') {
                    return value.normalize('NFC');
                }
                return value;
            }, 2);

            const javascriptCode = `
                window.paladinSurveys = ${surveysJson};
                const element = document.createElement('script');
                element.src = "https://form.paladin-forms.com/engine/latest/embed.js";
                setTimeout(() => { document.body.appendChild(element) }, 4000);
                window.PALADIN_SURVEY_URL = "https://form.paladin-forms.com/surveys/v1/index.html";
            `;

            // Write with explicit UTF-8 encoding
            stream.end(Buffer.from(javascriptCode, 'utf8'));

            // Wait for the stream to finish
            await new Promise((resolve, reject) => {
                stream.on('finish', resolve);
                stream.on('error', reject);
            });

            this.logger.log(`JavaScript code generated successfully for user ${user.email}`);
        }
        catch (error: unknown) {
            this.logger.error(`Error generating JavaScript code for user ${user.email}: ${error instanceof Error ? error.stack : 'Unknown error'}`);
            console.log(error);
            throw error;
        }
    }
}
