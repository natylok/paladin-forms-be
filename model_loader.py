import os
import sys
import json
import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

def load_model(cache_dir=None):
    """Load the BART model for question answering"""
    try:
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

def answer_question(model, tokenizer, context, question):
    """Generate an answer for a question based on the given context"""
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

def main():
    try:
        # Load the model once
        model, tokenizer = load_model()
        print("Question answering service ready", file=sys.stderr)
        sys.stderr.flush()
        
        # Process requests
        for line in sys.stdin:
            try:
                # Parse input JSON
                input_data = json.loads(line.strip())
                feedbacks = input_data.get('feedbacks', [])
                question = input_data.get('question', '')
                print(f"Received feedbacks: {len(feedbacks)}", file=sys.stderr)
                
                # Format all feedbacks into a single context
                context = format_context(feedbacks)
                
                # Generate answer
                answer = answer_question(model, tokenizer, context, question)
                
                # Output result
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

if __name__ == "__main__":
    main() 