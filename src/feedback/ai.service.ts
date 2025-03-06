import OpenAI from "openai";

const aiSystemPromptForPositiveNegativeFeedbacks = `
    Your job is to return me feedbacks overview, return me json exactly like that:
    {
        mostCommonSurvey: surveyId,
        surveyId: {
            positiveFeedbacks: number as precent,
            negativeFeedbacks: number as precent,
            mostCommonFeedback: string,
            here will be also keys values for the most common things you find in those feedbacks 
        }

    }
    please return results that if ill ask you again you will return the same results for the same feedbacks i want the answer to be the most stable it can be
    return it as object so i could parse it with JSON.parse dont write json just write the object {}
`
export const overviewFeedbacks = async (feedbacks: any[]) => {
    const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY})
    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { 
                role: 'system', 
                content: [
                    {
                        type: 'text',
                        text: aiSystemPromptForPositiveNegativeFeedbacks
                    }
                ]
            },
            { 
                role: 'user', 
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(feedbacks)
                    }
                ]
            }
        ],
    });
    return response.choices[0].message.content?.replace(/\n/g, '');
}