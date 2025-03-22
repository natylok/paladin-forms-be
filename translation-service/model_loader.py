import os
import sys
import json
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM, pipeline

def load_model(model_path="Helsinki-NLP/opus-mt-en-fr", cache_dir=None):
    """Load the model and return a translation pipeline"""
    try:
        # Use environment variable for cache directory or default to ./models
        cache_dir = cache_dir or os.getenv('TRANSFORMERS_CACHE', './models')
        
        # Create cache directory if it doesn't exist
        os.makedirs(cache_dir, exist_ok=True)
        
        print(f"Using cache directory: {cache_dir}", file=sys.stderr)
        
        # Load tokenizer and model
        tokenizer = AutoTokenizer.from_pretrained(
            model_path,
            cache_dir=cache_dir,
            local_files_only=False  # Set to True after first download
        )
        
        model = AutoModelForSeq2SeqLM.from_pretrained(
            model_path,
            cache_dir=cache_dir,
            local_files_only=False  # Set to True after first download
        )
        
        # Create translation pipeline
        translator = pipeline(
            "translation",
            model=model,
            tokenizer=tokenizer,
            device=-1  # Use CPU
        )
        
        print(f"Model loaded successfully from {model_path}", file=sys.stderr)
        return translator
        
    except Exception as e:
        print(f"Error loading model: {str(e)}", file=sys.stderr)
        sys.exit(1)

def translate_text(translator, text):
    """Translate a single piece of text"""
    try:
        result = translator(text)
        return result[0]['translation_text']
    except Exception as e:
        print(f"Translation error: {str(e)}", file=sys.stderr)
        return ""

def main():
    # Load the model
    translator = load_model()
    
    print("Translation service ready to process requests", file=sys.stderr)
    sys.stderr.flush()
    
    # Read input from stdin and write translations to stdout
    for line in sys.stdin:
        try:
            # Parse input JSON
            input_data = json.loads(line)
            text = input_data.get('text', '')
            
            # Translate
            translation = translate_text(translator, text)
            
            # Output result as JSON
            result = {'translation': translation}
            print(json.dumps(result))
            sys.stdout.flush()
            
        except json.JSONDecodeError:
            print(json.dumps({'error': 'Invalid JSON input'}))
            sys.stdout.flush()
        except Exception as e:
            print(json.dumps({'error': str(e)}))
            sys.stdout.flush()

if __name__ == "__main__":
    main() 