import os
import sys
import json
import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM, pipeline
from collections import defaultdict
from datetime import datetime, timedelta
from difflib import SequenceMatcher
import re

# Global variables to store the loaded models and tokenizers
model = None
tokenizer = None
sentiment_classifier = None

def load_model(cache_dir=None):
    """Load the BART model for question answering and sentiment analysis"""
    global model, tokenizer, sentiment_classifier
    try:
        if model is not None and tokenizer is not None and sentiment_classifier is not None:
            print("Models already loaded", file=sys.stderr)
            return model, tokenizer, sentiment_classifier

        # Use environment variable for cache directory or default to ./models
        cache_dir = cache_dir or os.getenv('TRANSFORMERS_CACHE', './models')
        os.makedirs(cache_dir, exist_ok=True)
        
        print(f"Using cache directory: {cache_dir}", file=sys.stderr)
        
        # Load BART model and tokenizer
        model_name = "facebook/bart-large-cnn"
        tokenizer = AutoTokenizer.from_pretrained(
            model_name,
            cache_dir=cache_dir,
            local_files_only=False
        )
        
        model = AutoModelForSeq2SeqLM.from_pretrained(
            model_name,
            cache_dir=cache_dir,
            local_files_only=False
        )
        model.eval()
        
        # Load sentiment analysis model
        sentiment_classifier = pipeline(
            "sentiment-analysis",
            model="distilbert-base-uncased-finetuned-sst-2-english",
            cache_dir=cache_dir
        )
        
        print(f"Models loaded successfully", file=sys.stderr)
        return model, tokenizer, sentiment_classifier
        
    except Exception as e:
        print(f"Error loading models: {str(e)}", file=sys.stderr)
        sys.exit(1)

def format_context(feedbacks):
    """Format all feedback questions and answers into a single context string"""
    try:
        if not feedbacks:
            return ""
            
        context_parts = []
        for feedback in feedbacks:
            if isinstance(feedback, dict):
                # Handle feedback object with questions and answers
                questions = feedback.get('questions', [])
                for q in questions:
                    question_text = q.get('question', '')
                    answer_text = q.get('answer', '')
                    if question_text and answer_text:
                        context_parts.append(f"Q: {question_text}\nA: {answer_text}")
            elif isinstance(feedback, str):
                # Handle direct text feedback
                context_parts.append(feedback)
                
        return "\n\n".join(context_parts)
    except Exception as e:
        print(f"Error formatting context: {str(e)}", file=sys.stderr)
        return ""

def answer_question(context, question):
    """Generate an answer for a question based on the given context"""
    global model, tokenizer
    try:
        if not context or not question:
            return "No context or question provided"
            
        # Prepare the input by combining context and question
        input_text = f"Context: {context}\nQuestion: {question}"
        
        # Tokenize with basic settings
        inputs = tokenizer(input_text, return_tensors="pt", max_length=1024, truncation=True)
        
        # Generate answer
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_length=150,
                num_beams=4,
                length_penalty=2.0,
                early_stopping=True
            )
        
        # Decode the answer
        answer = tokenizer.decode(outputs[0], skip_special_tokens=True)
        return answer
        
    except Exception as e:
        print(f"Question answering error: {str(e)}", file=sys.stderr)
        return "Error generating answer"

def get_sentiment_category(text):
    """Get the sentiment category of a text"""
    global sentiment_classifier
    try:
        result = sentiment_classifier(text)[0]
        label = result['label'].lower()
        score = result['score']
        
        # Map sentiment labels to categories
        if label == 'positive':
            if score > 0.9:
                return 'very_positive'
            return 'positive'
        elif label == 'negative':
            if score > 0.9:
                return 'very_negative'
            return 'negative'
        return 'neutral'
    except Exception as e:
        print(f"Error in sentiment analysis: {str(e)}", file=sys.stderr)
        return 'neutral'

def clean_sentence(sentence):
    """Clean and normalize a sentence for comparison"""
    # Remove extra whitespace
    sentence = re.sub(r'\s+', ' ', sentence).strip()
    # Convert to lowercase
    sentence = sentence.lower()
    # Remove punctuation
    sentence = re.sub(r'[^\w\s]', '', sentence)
    return sentence

def are_sentences_similar(s1, s2, threshold=0.8):
    """Check if two sentences are similar using sequence matching"""
    s1_clean = clean_sentence(s1)
    s2_clean = clean_sentence(s2)
    ratio = SequenceMatcher(None, s1_clean, s2_clean).ratio()
    return ratio >= threshold

def extract_trending_sentences(feedbacks, time_window_days=30):
    """Extract trending sentences from feedback by finding similar/repeated sentences with same sentiment"""
    global model, tokenizer, sentiment_classifier
    try:
        if not feedbacks:
            return []
            
        # Extract all sentences from feedback with their sentiment
        all_sentences = []
        for feedback in feedbacks:
            if isinstance(feedback, dict):
                questions = feedback.get('questions', [])
                for q in questions:
                    answer_text = q.get('answer', '')
                    if answer_text:
                        # Split answer into sentences
                        sentences = [s.strip() for s in re.split(r'[.!?]+', answer_text) if s.strip()]
                        for sentence in sentences:
                            if len(sentence.split()) >= 3:  # Skip very short sentences
                                sentiment = get_sentiment_category(sentence)
                                all_sentences.append({
                                    'text': sentence,
                                    'sentiment': sentiment
                                })
            elif isinstance(feedback, str):
                sentences = [s.strip() for s in re.split(r'[.!?]+', feedback) if s.strip()]
                for sentence in sentences:
                    if len(sentence.split()) >= 3:
                        sentiment = get_sentiment_category(sentence)
                        all_sentences.append({
                            'text': sentence,
                            'sentiment': sentiment
                        })
        
        # Group similar sentences with same sentiment
        sentence_groups = []
        for sentence_data in all_sentences:
            sentence = sentence_data['text']
            sentiment = sentence_data['sentiment']
            
            # Check if sentence is similar to any existing group with same sentiment
            found_group = False
            for group in sentence_groups:
                if (group['sentiment'] == sentiment and 
                    are_sentences_similar(sentence, group['representative'])):
                    group['sentences'].append(sentence)
                    found_group = True
                    break
            
            # If no similar group found with same sentiment, create new group
            if not found_group:
                sentence_groups.append({
                    'representative': sentence,
                    'sentences': [sentence],
                    'sentiment': sentiment
                })
        
        # Score groups by size and return top sentences
        scored_groups = []
        for group in sentence_groups:
            if len(group['sentences']) > 1:  # Only include groups with multiple similar sentences
                scored_groups.append({
                    'sentence': group['representative'],
                    'count': len(group['sentences']),
                    'sentiment': group['sentiment'],
                    'examples': group['sentences'][:3]  # Include up to 3 examples
                })
        
        # Sort by count and return top sentences
        scored_groups.sort(key=lambda x: x['count'], reverse=True)
        return [{
            'text': group['sentence'],
            'sentiment': group['sentiment'],
            'count': group['count']
        } for group in scored_groups[:10]]
        
    except Exception as e:
        print(f"Error extracting trending sentences: {str(e)}", file=sys.stderr)
        return []

def main():
    try:
        # Load the models once at startup
        load_model()
        print("Models loaded and ready for processing", file=sys.stderr)
        sys.stderr.flush()
        
        # Process requests
        for line in sys.stdin:
            try:
                # Parse input JSON
                input_data = json.loads(line.strip())
                feedbacks = input_data.get('feedbacks', [])
                question = input_data.get('question', '')
                action = input_data.get('action', 'answer')  # Default to answer if not specified
                
                if action == 'extract_trending_sentences':
                    # Extract trending sentences
                    sentences = extract_trending_sentences(feedbacks)
                    result = {
                        'sentences': sentences,
                        'count': len(sentences)
                    }
                elif action == 'answer':
                    # Default to question answering
                    context = format_context(feedbacks)
                    answer = answer_question(context, question)
                    result = {
                        'answer': answer,
                        'context': context,
                        'question': question
                    }
                
                print(json.dumps(result))
                sys.stdout.flush()
                
            except json.JSONDecodeError as e:
                print(json.dumps({"error": f"Invalid JSON input: {str(e)}"}))
                sys.stdout.flush()
            except Exception as e:
                print(json.dumps({"error": f"Error processing request: {str(e)}"}))
                sys.stdout.flush()
    except Exception as e:
        print(json.dumps({"error": f"Fatal error: {str(e)}"}))
        sys.stdout.flush()
        sys.exit(1)

if __name__ == "__main__":
    main() 