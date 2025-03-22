import os
import sys
import json
import torch
from transformers import M2M100ForConditionalGeneration, M2M100Tokenizer

def load_model(cache_dir=None):
    """Load the multilingual translation model"""
    try:
        # Use environment variable for cache directory or default to ./models
        cache_dir = cache_dir or os.getenv('TRANSFORMERS_CACHE', './models')
        os.makedirs(cache_dir, exist_ok=True)
        
        print(f"Using cache directory: {cache_dir}", file=sys.stderr)
        
        # Load tokenizer and model
        model_name = "facebook/m2m100_418M"
        
        tokenizer = M2M100Tokenizer.from_pretrained(
            model_name,
            cache_dir=cache_dir,
            local_files_only=False
        )
        
        # Load model with basic optimizations
        model = M2M100ForConditionalGeneration.from_pretrained(
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

def translate_text(model, tokenizer, text, source_lang="en", target_lang="fr"):
    """Translate text between any supported language pair"""
    try:
        if not text or text.isspace():
            return text
            
        # Set the source language
        tokenizer.src_lang = source_lang
        
        # Tokenize with basic settings
        encoded = tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
        
        # Generate translation
        with torch.no_grad():
            generated_tokens = model.generate(
                **encoded,
                forced_bos_token_id=tokenizer.get_lang_id(target_lang),
                max_length=512,
                num_beams=2,
                length_penalty=1.0
            )
        
        # Decode the translation
        translation = tokenizer.batch_decode(generated_tokens, skip_special_tokens=True)[0]
        return translation
        
    except Exception as e:
        print(f"Translation error: {str(e)}", file=sys.stderr)
        return text

def main():
    try:
        # Load the model once
        model, tokenizer = load_model()
        print("Translation service ready", file=sys.stderr)
        sys.stderr.flush()
        
        # Process requests
        for line in sys.stdin:
            try:
                # Parse input JSON
                input_data = json.loads(line.strip())
                text = input_data.get('text', '')
                source_lang = input_data.get('source_lang', 'en')
                target_lang = input_data.get('target_lang', 'fr')
                
                # Translate
                translation = translate_text(model, tokenizer, text, source_lang, target_lang)
                
                # Output result
                result = {
                    'translation': translation,
                    'source_lang': source_lang,
                    'target_lang': target_lang
                }
                print(json.dumps(result))
                sys.stdout.flush()
                
            except json.JSONDecodeError as e:
                print(json.dumps({"error": f"Invalid JSON input: {str(e)}"}))
                sys.stdout.flush()
            except Exception as e:
                print(json.dumps({"error": str(e)}))
                sys.stdout.flush()
            
            sys.stdout.flush()
            
    except Exception as e:
        print(json.dumps({"error": f"Fatal error: {str(e)}"}))
        sys.stdout.flush()
        sys.exit(1)

if __name__ == "__main__":
    main() 