import json
import faiss
from sentence_transformers import SentenceTransformer
import numpy as np

class RAGRetriever:
    def __init__(self, faiss_index_path, faiss_map_path):
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        self.index = faiss.read_index(faiss_index_path)
        with open(faiss_map_path, mode='r', encoding='utf-8') as f:
            self.faiss_map = json.load(f)

    def retrieve(self, query, k=3):
        """
        Retrieves top-k relevant chunks based on the query.
        """
        query_embedding = self.model.encode([query]).astype('float32')
        
        # Perform search
        distances, indices = self.index.search(query_embedding, k)
        
        retrieved_chunks = []
        for i, idx in enumerate(indices[0]):
            if idx != -1: # Check if a valid index is returned
                chunk_info = self.faiss_map[idx]
                retrieved_chunks.append({
                    'original_id': chunk_info['original_id'],
                    'chunk_text': chunk_info['chunk_text'],
                    'distance': distances[0][i]
                })
        return retrieved_chunks

if __name__ == "__main__":
    faiss_index_path = "/mnt/d/progress/munjero_rag_system/munjero_rag_system/models/faiss_index.bin"
    faiss_map_path = "/mnt/d/progress/munjero_rag_system/munjero_rag_system/models/faiss_index.bin.map"

    retriever = RAGRetriever(faiss_index_path, faiss_map_path)

    test_query = "실용성 높은 법 문제"
    print(f"Retrieving chunks for query: \"{test_query}\"...")
    results = retriever.retrieve(test_query, k=2)
    for i, result in enumerate(results):
        print(f"\nResult {i+1}:")
        print(f"  Original ID: {result['original_id']}")
        print(f"  Chunk Text: {result['chunk_text']}")
        print(f"  Distance: {result['distance']}")

    test_query_2 = "경제학 수요 공급 법칙"
    print(f"\nRetrieving chunks for query: \"{test_query_2}\"...")
    results_2 = retriever.retrieve(test_query_2, k=2)
    for i, result in enumerate(results_2):
        print(f"\nResult {i+1}:")
        print(f"  Original ID: {result['original_id']}")
        print(f"  Chunk Text: {result['chunk_text']}")
        print(f"  Distance: {result['distance']}")
