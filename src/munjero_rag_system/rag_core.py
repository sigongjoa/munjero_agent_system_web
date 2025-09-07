from sentence_transformers import SentenceTransformer
from langchain.text_splitter import RecursiveCharacterTextSplitter
import faiss
import numpy as np
import json

# Initialize SentenceTransformer model globally to avoid reloading
model = SentenceTransformer('all-MiniLM-L6-v2')

# Initialize text splitter globally (will be used if custom parsing fails or for general text)
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=200,
    chunk_overlap=20,
    separators=["\n\n", "\n", " ", ""]
)

def process_pdf_for_rag(pdf_file, extract_structured_content_from_pdf_func):
    # pdfplumber expects a file path or a file-like object that it can seek
    # io.BytesIO is suitable for this.
    
    # Pass the BytesIO object directly to the new extraction function
    structured_chunks = extract_structured_content_from_pdf_func(pdf_file)
    
    if not structured_chunks:
        return None, "No structured content generated from the PDF."

    # Convert structured chunks to a string representation for embedding
    chunks_for_embedding = [json.dumps(chunk, ensure_ascii=False) for chunk in structured_chunks]

    # Generate embeddings for each chunk
    chunk_embeddings = model.encode(chunks_for_embedding).astype('float32')

    # Create an in-memory FAISS index
    embedding_dimension = chunk_embeddings.shape[1]
    index = faiss.IndexFlatL2(embedding_dimension)
    index.add(chunk_embeddings)

    return {
        'chunks': structured_chunks, # Return structured chunks for display
        'index': index,
        'chunk_embeddings': chunk_embeddings 
    }, None
