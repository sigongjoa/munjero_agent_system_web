import json
import numpy as np
import faiss

def create_and_save_faiss_index(processed_data_path, faiss_index_path):
    """
    Creates a FAISS index from processed data and saves it to a file.
    """
    with open(processed_data_path, mode='r', encoding='utf-8') as f:
        processed_data = json.load(f)

    # Assuming all embeddings have the same dimension
    embedding_dimension = len(processed_data[0]['chunk_embeddings'][0])

    # Prepare embeddings for FAISS
    all_embeddings = []
    # Store a mapping from FAISS index to original question ID and chunk index
    # This will be useful for retrieval later
    faiss_id_to_original_data = [] 

    for item in processed_data:
        for i, embedding in enumerate(item['chunk_embeddings']):
            all_embeddings.append(embedding)
            faiss_id_to_original_data.append({
                'original_id': item['id'],
                'chunk_index': i,
                'chunk_text': item['chunks'][i]
            })

    all_embeddings_np = np.array(all_embeddings).astype('float32')

    # Create a FAISS index (using IndexFlatL2 for simplicity)
    index = faiss.IndexFlatL2(embedding_dimension)
    index.add(all_embeddings_np)

    # Save the FAISS index
    faiss.write_index(index, faiss_index_path)

    # Save the mapping as well, as FAISS only stores vectors
    with open(faiss_index_path + ".map", mode='w', encoding='utf-8') as f:
        json.dump(faiss_id_to_original_data, f, indent=4, ensure_ascii=False)

if __name__ == "__main__":
    processed_data_input_path = "/mnt/d/progress/munjero_rag_system/munjero_rag_system/data/processed_data.json"
    faiss_index_output_path = "/mnt/d/progress/munjero_rag_system/munjero_rag_system/models/faiss_index.bin"
    
    print(f"Creating FAISS index from {processed_data_input_path} and saving to {faiss_index_output_path}...")
    create_and_save_faiss_index(processed_data_input_path, faiss_index_output_path)
    print("FAISS index creation complete.")
