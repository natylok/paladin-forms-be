import { DEMOGRAPHIC_PATTERNS, FILTER_PHRASES, RATING_PHRASES } from '../constants/feedback.constants';

export function isDemographicResponse(text: string): boolean {
    return DEMOGRAPHIC_PATTERNS.some(pattern => pattern.pattern.test(text));
}

export function containsPhrases(text: string, phrases: string[]): boolean {
    const lowerText = text.toLowerCase();
    return phrases.some(phrase => lowerText.includes(phrase.toLowerCase()));
}

export function convertRatingToNumber(value: string): number {
    // Handle numeric ratings
    const numericValue = Number(value);
    if (!isNaN(numericValue)) {
        if (numericValue >= 1 && numericValue <= 5) {
            return numericValue;
        }
        // Convert 1-10 scale to 1-5
        if (numericValue >= 1 && numericValue <= 10) {
            return Math.round((numericValue / 2));
        }
        return -1;
    }

    // Handle text-based ratings
    const lowerValue = value.toLowerCase();
    
    if (RATING_PHRASES.positive.some(phrase => lowerValue.includes(phrase.toLowerCase()))) {
        // Map positive phrases to high ratings (4-5)
        return lowerValue.includes('very') || lowerValue.includes('strongly') ? 5 : 4;
    }
    
    if (RATING_PHRASES.negative.some(phrase => lowerValue.includes(phrase.toLowerCase()))) {
        // Map negative phrases to low ratings (1-2)
        return lowerValue.includes('very') || lowerValue.includes('strongly') ? 1 : 2;
    }
    
    if (RATING_PHRASES.neutral.some(phrase => lowerValue.includes(phrase.toLowerCase()))) {
        // Map neutral phrases to middle rating (3)
        return 3;
    }

    return -1;
}

export function getWeekKey(date: Date): string {
    const year = date.getFullYear();
    const weekNumber = getWeekNumber(date);
    return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
}

export function getMonthKey(date: Date): string {
    return date.toISOString().substring(0, 7); // YYYY-MM format
}

export function extractCommonPhrases(texts: string[], minOccurrences: number = 2): string[] {
    const phrases: Map<string, number> = new Map();
    const words = new Set<string>();

    // First pass: collect individual words and their frequencies
    texts.forEach(text => {
        const textWords = text.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(word => word.length > 3);
        
        textWords.forEach(word => words.add(word));
    });

    // Second pass: find phrases (2-4 words) and count their occurrences
    texts.forEach(text => {
        const normalizedText = text.toLowerCase().replace(/[^\w\s]/g, '');
        const textWords = normalizedText.split(/\s+/);

        // Look for phrases of different lengths (2-4 words)
        for (let length = 2; length <= 4; length++) {
            for (let i = 0; i <= textWords.length - length; i++) {
                const phrase = textWords.slice(i, i + length).join(' ');
                if (isValidPhrase(phrase, words)) {
                    phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
                }
            }
        }
    });

    // Filter and sort phrases by frequency
    return Array.from(phrases.entries())
        .filter(([_, count]) => count >= minOccurrences)
        .sort(([_, countA], [__, countB]) => countB - countA)
        .map(([phrase]) => phrase);
}

function isValidPhrase(phrase: string, words: Set<string>): boolean {
    // Ignore phrases with common stop words at the start or end
    const stopWords = new Set(['the', 'and', 'but', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with']);
    const phraseWords = phrase.split(' ');
    
    if (stopWords.has(phraseWords[0]) || stopWords.has(phraseWords[phraseWords.length - 1])) {
        return false;
    }

    // Check if all words in the phrase are in our word set
    return phraseWords.every(word => words.has(word));
}

function getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
} 