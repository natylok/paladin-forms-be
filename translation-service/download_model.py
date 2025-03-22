import os
import logging
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM, pipeline

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TranslationService:
    def __init__(self, model_name="Helsinki-NLP/opus-mt-en-fr", cache_dir="./models"):
        self.model_name = model_name
        self.cache_dir = cache_dir
        self.translator = None
        self.is_initialized = False
        
        # Create cache directory if it doesn't exist
        os.makedirs(cache_dir, exist_ok=True)
        
        self.initialize_model()
    
    def initialize_model(self):
        try:
            if self.is_initialized:
                return
            
            logger.info("Starting translation model initialization...")
            
            # Download and load the model and tokenizer locally
            tokenizer = AutoTokenizer.from_pretrained(
                self.model_name,
                cache_dir=self.cache_dir,
                local_files_only=False  # Set to True after first download
            )
            
            model = AutoModelForSeq2SeqLM.from_pretrained(
                self.model_name,
                cache_dir=self.cache_dir,
                local_files_only=False  # Set to True after first download
            )
            
            # Create the translation pipeline
            self.translator = pipeline(
                "translation",
                model=model,
                tokenizer=tokenizer,
                device=-1  # Use CPU. For GPU, use 0 or the specific GPU index
            )
            
            self.is_initialized = True
            logger.info(f"Translation model loaded successfully from {self.model_name}")
            
        except Exception as error:
            logger.error(f"Failed to load translation model: {str(error)}")
            raise
    
    def translate(self, text):
        try:
            if not self.is_initialized or not self.translator:
                self.initialize_model()
            
            result = self.translator(text)
            return result[0]['translation_text']
            
        except Exception as error:
            logger.error(f"Translation failed for text '{text}': {str(error)}")
            raise

def main():
    # Example usage
    translator = TranslationService()
    
    # Test translations
    test_texts = [
        "Hello, how are you?",
        "This is a test of the translation system.",
        "Machine learning is fascinating."
    ]
    
    for text in test_texts:
        try:
            translation = translator.translate(text)
            print(f"\nEnglish: {text}")
            print(f"French: {translation}")
        except Exception as e:
            print(f"Error translating '{text}': {str(e)}")

if __name__ == "__main__":
    main() 