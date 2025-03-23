import { Injectable } from "@nestjs/common";
import { Survey } from "../../../shared/schemas/survey.schema";
import { Model } from "mongoose";
import { InjectModel } from "@nestjs/mongoose";

@Injectable()
export class SurveyService {
    constructor(@InjectModel(Survey.name) private readonly surveyModel: Model<Survey>) {}

    async getSurveyById(surveyId: string, user: { email: string }) {
        return this.surveyModel.findOne({ surveyId: surveyId, creatorEmail: user.email });
    }

    async updateSurvey(surveyId: string, survey: Survey) {
        return this.surveyModel.updateOne({ surveyId: surveyId }, { $set: survey });
    }
}
