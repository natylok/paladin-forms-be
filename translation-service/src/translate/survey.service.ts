import { Injectable } from "@nestjs/common";
import { Survey } from "./survey.schema";
import { Model } from "mongoose";
@Injectable()
export class SurveyService {
    constructor(private readonly surveySchema: Model<Survey>) {}

    async getSurveyById(surveyId: string, user: { email: string }) {
        return this.surveySchema.findOne({ surveyId: surveyId, email: user.email });
    }
}
