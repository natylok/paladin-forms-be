export const CACHE_TTL = 3600; // 1 hour in seconds

export const FILTER_PROMPTS = {
    positive: 'Analyze this feedback and determine if it expresses positive sentiment, satisfaction, or praise.',
    negative: 'Analyze this feedback and determine if it expresses negative sentiment, dissatisfaction, or criticism.',
    neutral: 'Analyze this feedback and determine if it expresses neutral or balanced sentiment.',
    all: 'Analyze the sentiment of this feedback.'
};

export const DEMOGRAPHIC_PATTERNS = [
    {
        field: 'age',
        pattern: /\b(?:age|years old|\d{1,2}\s*(?:yo|years?))\b/i,
        category: 'Age'
    },
    {
        field: 'gender',
        pattern: /\b(?:male|female|non-binary|gender|man|woman)\b/i,
        category: 'Gender'
    },
    {
        field: 'location',
        pattern: /\b(?:from|live[s]? in|based in|location|country|city|region)\b/i,
        category: 'Location'
    },
    {
        field: 'occupation',
        pattern: /\b(?:work|job|profession|role|position|title|career)\b/i,
        category: 'Occupation'
    },
    {
        field: 'experience',
        pattern: /\b(?:experience|years? of|background|expertise)\b/i,
        category: 'Experience'
    }
];

export const RATING_PHRASES = {
    positive: [
        'Very Satisfied',
        'Satisfied',
        'Excellent',
        'Good',
        'Like',
        'Strongly Agree',
        'Agree'
    ],
    negative: [
        'Very Dissatisfied',
        'Dissatisfied',
        'Poor',
        'Bad',
        'Dislike',
        'Strongly Disagree',
        'Disagree'
    ],
    neutral: [
        'Neutral',
        'Neither Agree nor Disagree',
        'Average',
        'OK',
        'Okay',
        'Fair'
    ]
};

export const FILTER_PHRASES = {
    praise: [
        'great', 'excellent', 'amazing', 'love', 'awesome', 'fantastic',
        'helpful', 'best', 'perfect', 'wonderful', 'outstanding',
        'impressed', 'impressive', 'satisfied', 'satisfaction',
        'easy', 'intuitive', 'user-friendly', 'efficient'
    ],
    bugs: [
        'bug', 'issue', 'problem', 'error', 'crash', 'broken',
        'not working', "doesn't work", 'fails', 'failure',
        'difficult', 'hard', 'confusing', 'confused',
        'frustrated', 'frustrating', 'poor', 'bad',
        'slow', 'laggy', 'stuck', 'freezes'
    ],
    suggestions: [
        'suggest', 'suggestion', 'recommend', 'recommendation',
        'would be nice', 'could be better', 'improve',
        'enhancement', 'feature request', 'add', 'missing'
    ],
    urgent: [
        'urgent', 'critical', 'emergency', 'immediate',
        'asap', 'serious', 'severe', 'major',
        'blocking', 'blocked', 'showstopper', 'show stopper',
        'production', 'prod', 'down', 'outage'
    ]
};

export const SENTIMENT_THRESHOLDS = {
    positive: 0.7,
    negative: 0.7,
    neutral: 0.5
};
