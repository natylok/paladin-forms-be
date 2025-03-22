export interface Publication {
    id: string;
    title: string;
    description: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface Feedback {
  id: string;
  customerId: string;
  email: string;
  publication: Publication;
  feedbacksType: 'POSITIVE' | 'NEGATIVE' | 'ALL'
}
