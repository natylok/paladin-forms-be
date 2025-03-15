export type TimeFrame = 'day' | 'week' | 'month';

export interface PublicationEvent {
  id: string;
  timeFrame: TimeFrame;
  emails: string[];
  creatorEmail: string;
  customerId: string;
  action: 'create' | 'update' | 'delete';
  actionBy: string;
  changes?: Partial<{
    timeFrame: TimeFrame;
    emails: string[];
    creatorEmail: string;
    customerId: string;
  }>;
}

export interface FeedbackSummary {
  textAnalysis: {
    topStrengths: string[];
    topConcerns: string[];
    suggestions: string[];
    urgentIssues: string[];
  };
  statistics: {
    totalFeedbacks: number;
    textResponseCount: number;
    averageSentiment: number;
    ratingStats: {
      total: number;
      average: number;
      distribution: {
        [key: string]: number;
      };
    };
    "1to10": {
      total: number;
      average: number;
      distribution: {
        [key: string]: number;
      };
    };
  };
  sentimentDistribution: {
    positive: number;
    negative: number;
    neutral: number;
  };
  feedbackTrends: {
    byDay: TimelineTrend;
    byWeek: TimelineTrend;
    byMonth: TimelineTrend;
  };
}

export interface TimelineTrend {
  labels: string[];
  positive: number[];
  negative: number[];
}

export interface EmailTrigger {
  publicationId: string;
  timeFrame: TimeFrame;
  emails: string[];
  customerId: string;
  triggerAt: Date;
}

export interface EmailData extends EmailTrigger {
  summary: FeedbackSummary;
} 