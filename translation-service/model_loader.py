import os
import sys
import json
from transformers import M2M100ForConditionalGeneration, M2M100Tokenizer, pipeline

def load_model(cache_dir=None):
    """Load the multilingual translation model"""
    try:
        # Use environment variable for cache directory or default to ./models
        cache_dir = cache_dir or os.getenv('TRANSFORMERS_CACHE', './models')
        
        # Create cache directory if it doesn't exist
        os.makedirs(cache_dir, exist_ok=True)
        
        print(f"Using cache directory: {cache_dir}", file=sys.stderr)
        
        # Load tokenizer and model - using M2M100 which supports many language pairs
        model_name = "facebook/m2m100_418M"  # smaller version, use facebook/m2m100_1.2B for better quality
        
        tokenizer = M2M100Tokenizer.from_pretrained(
            model_name,
            cache_dir=cache_dir,
            local_files_only=False
        )
        
        model = M2M100ForConditionalGeneration.from_pretrained(
            model_name,
            cache_dir=cache_dir,
            local_files_only=False
        )
        
        print(f"Model loaded successfully from {model_name}", file=sys.stderr)
        return model, tokenizer
        
    except Exception as e:
        print(f"Error loading model: {str(e)}", file=sys.stderr)
        sys.exit(1)

def translate_text(model, tokenizer, text, source_lang="en", target_lang="fr"):
    """Translate text between any supported language pair"""
    try:
        # Set the source language
        tokenizer.src_lang = source_lang
        
        # Tokenize the text
        encoded = tokenizer(text, return_tensors="pt")
        
        # Generate translation
        generated_tokens = model.generate(
            **encoded,
            forced_bos_token_id=tokenizer.get_lang_id(target_lang)
        )
        
        # Decode the translation
        translation = tokenizer.batch_decode(generated_tokens, skip_special_tokens=True)[0]
        return translation
        
    except Exception as e:
        print(f"Translation error: {str(e)}", file=sys.stderr)
        return ""

def main():
    # Load the model once
    model, tokenizer = load_model()
    
    print("Multilingual translation service ready to process requests", file=sys.stderr)
    sys.stderr.flush()
    
    # Read input from stdin and write translations to stdout
    for line in sys.stdin:
        try:
            # Parse input JSON
            input_data = json.loads(line)
            text = input_data.get('text', '')
            source_lang = input_data.get('source_lang', 'en')
            target_lang = input_data.get('target_lang', 'fr')
            
            # Translate
            translation = translate_text(model, tokenizer, text, source_lang, target_lang)
            
            # Output result as JSON
            result = {
                'translation': translation,
                'source_lang': source_lang,
                'target_lang': target_lang
            }
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