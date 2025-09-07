import os
import re
from flask import Flask, request, render_template
from munjero_rag_system.pdf_processor import parse_problem_block, extract_structured_content_from_pdf
import io
import json

from munjero_rag_system.rag_core import process_pdf_for_rag

app = Flask(__name__, template_folder="templates", static_folder="static")

# Add custom Jinja2 filter to parse JSON strings
@app.template_filter('from_json')
def from_json_filter(value):
    return json.loads(value)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'pdf_file' not in request.files:
        return render_template('index.html', error='No file part')
    
    file = request.files['pdf_file']
    
    if file.filename == '':
        return render_template('index.html', error='No selected file')
        
    if file and file.filename.endswith('.pdf'):
        # Read the file into a BytesIO object
        pdf_bytes = io.BytesIO(file.read())
        
        processed_data, error = process_pdf_for_rag(pdf_bytes, extract_structured_content_from_pdf) # Pass the function
        
        if error:
            return render_template('index.html', error=error)

        # Display structured chunks
        return render_template('index.html', chunks=[json.dumps(chunk, ensure_ascii=False, indent=2) for chunk in processed_data['chunks']])
    else:
        return render_template('index.html', error='Invalid file type. Please upload a PDF.')

# Ensure the models directory exists for sentence-transformers to download models
# This is a workaround for potential issues with model caching in some environments
if not os.path.exists('./munjero_rag_system/models'):
    os.makedirs('./munjero_rag_system/models')