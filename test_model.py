import json
from model_loader import load_model, answer_question

def main():
    # Load the model
    model, tokenizer = load_model()
    
    # Example context and questions
    context = """
    The BART model is a sequence-to-sequence model developed by Facebook AI Research. 
    It is particularly effective at tasks like summarization and question answering. 
    The model was trained on a large corpus of text data and can generate human-like responses.
    """
    
    questions = [
        "What is BART?",
        "Who developed BART?",
        "What tasks is BART good at?",
    ]
    
    # Test each question
    for question in questions:
        print(f"\nQuestion: {question}")
        answer = answer_question(model, tokenizer, context, question)
        print(f"Answer: {answer}")

if __name__ == "__main__":
    main() 