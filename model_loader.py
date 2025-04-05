import os
import sys
import json
import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
from collections import defaultdict
from datetime import datetime, timedelta

# Global variables to store the loaded model and tokenizer
model = None
tokenizer = None

def load_model(cache_dir=None):
    """Load the BART model for question answering"""
    global model, tokenizer
    try:
        if model is not None and tokenizer is not None:
            print("Model already loaded", file=sys.stderr)
            return model, tokenizer

        # Use environment variable for cache directory or default to ./models
        cache_dir = cache_dir or os.getenv('TRANSFORMERS_CACHE', './models')
        os.makedirs(cache_dir, exist_ok=True)
        
        print(f"Using cache directory: {cache_dir}", file=sys.stderr)
        
        # Load tokenizer and model
        model_name = "facebook/bart-large-cnn"
        
        tokenizer = AutoTokenizer.from_pretrained(
            model_name,
            cache_dir=cache_dir,
            local_files_only=False
        )
        
        # Load model with basic optimizations
        model = AutoModelForSeq2SeqLM.from_pretrained(
            model_name,
            cache_dir=cache_dir,
            local_files_only=False
        )
        
        # Basic optimization for inference
        model.eval()
        
        print(f"Model loaded successfully from {model_name}", file=sys.stderr)
        return model, tokenizer
        
    except Exception as e:
        print(f"Error loading model: {str(e)}", file=sys.stderr)
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

def extract_trending_sentences(feedbacks, time_window_days=30):
    """Extract trending sentences from feedback using BART model"""
    global model, tokenizer
    try:
        if not feedbacks:
            return []
            
        # Group feedbacks by date
        feedback_by_date = defaultdict(list)
        current_date = datetime.now()
        cutoff_date = current_date - timedelta(days=time_window_days)
        
        for feedback in feedbacks:
            if isinstance(feedback, dict):
                date_str = feedback.get('date', '')
                try:
                    feedback_date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                    if feedback_date >= cutoff_date:
                        feedback_by_date[feedback_date.date()].append(feedback)
                except ValueError:
                    continue
        
        # Process feedbacks in chronological order
        trending_sentences = []
        for date in sorted(feedback_by_date.keys()):
            daily_feedbacks = feedback_by_date[date]
            context = format_context(daily_feedbacks)
            
            if not context:
                continue
                
            # Use BART to summarize the daily feedback
            inputs = tokenizer(context, return_tensors="pt", max_length=1024, truncation=True)
            
            with torch.no_grad():
                outputs = model.generate(
                    **inputs,
                    max_length=150,
                    num_beams=4,
                    length_penalty=2.0,
                    early_stopping=True,
                    no_repeat_ngram_size=3  # Prevent repetition
                )
            
            summary = tokenizer.decode(outputs[0], skip_special_tokens=True)
            
            # Extract key sentences from the summary
            sentences = [s.strip() for s in summary.split('.') if s.strip()]
            trending_sentences.extend(sentences)
        
        # Score sentences based on frequency and recency
        sentence_scores = defaultdict(float)
        for sentence in trending_sentences:
            # Basic scoring: more recent sentences get higher scores
            sentence_scores[sentence] += 1.0
        
        # Sort by score and return top sentences
        sorted_sentences = sorted(sentence_scores.items(), key=lambda x: x[1], reverse=True)
        return [sentence for sentence, _ in sorted_sentences[:10]]
        
    except Exception as e:
        print(f"Error extracting trending sentences: {str(e)}", file=sys.stderr)
        return []

def main():
    try:
        # Load the model once at startup
        load_model()
        print("Model loaded and ready for processing", file=sys.stderr)
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