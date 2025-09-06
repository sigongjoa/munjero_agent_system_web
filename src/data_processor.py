import csv
import json
from langchain.text_splitter import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer

def process_data_for_rag(csv_file_path, output_json_path):
    """
    Reads data from a CSV, chunks text, generates embeddings, and saves to a JSON file.
    """
    
    # Load the sentence transformer model
    model = SentenceTransformer('all-MiniLM-L6-v2')

    # Initialize text splitter
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=200,
        chunk_overlap=20,
        separators=["\n\n", "\n", " ", ""]
    )

    processed_data = []

    with open(csv_file_path, mode='r', encoding='utf-8') as csv_file:
        csv_reader = csv.DictReader(csv_file)
        for row in csv_reader:
            question_id = row['id']
            question_text = row['question_text']
            
            # Chunk the question text
            chunks = text_splitter.split_text(question_text)
            
            # Generate embeddings for each chunk
            chunk_embeddings = model.encode(chunks).tolist() # Convert numpy array to list for JSON serialization

            processed_data.append({
                'id': question_id,
                'original_question': row, # Store the entire original row
                'chunks': chunks,
                'chunk_embeddings': chunk_embeddings
            })

    with open(output_json_path, mode='w', encoding='utf-8') as json_file:
        json.dump(processed_data, json_file, indent=4, ensure_ascii=False)

if __name__ == "__main__":
    # Define paths relative to the project root
    csv_input_path = "/mnt/d/progress/munjero_rag_system/munjero_rag_system/data/data.csv"
    json_output_path = "/mnt/d/progress/munjero_rag_system/munjero_rag_system/data/processed_data.json"
    
    print(f"Processing data from {csv_input_path} and saving to {json_output_path}...")
    process_data_for_rag(csv_input_path, json_output_path)
    print("Data processing complete.")