import os
import re
from flask import Flask, request, render_template
from munjero_rag_system.pdf_processor import parse_problem_block, extract_structured_content_from_pdf
import io
import json
import redis

from munjero_rag_system.rag_core import process_pdf_for_rag

app = Flask(__name__, template_folder="templates", static_folder="static")
r = redis.Redis(host='localhost', port=6379, db=0)

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

@app.route('/api/trigger-chatgpt-image', methods=['POST'])
def trigger_chatgpt_image():
    data = request.get_json()
    prompt = data.get('prompt')
    task_id = data.get('task_id')

    if not prompt or not task_id:
        return jsonify({'error': 'Missing prompt or task_id'}), 400

    task_payload = {
        'type': 'generate_image_from_prompt',
        'payload': {
            'prompt': prompt,
            'task_id': task_id
        }
    }
    r.rpush('puppeteer_chatgpt_tasks_list', json.dumps(task_payload))
    return jsonify({'status': 'Task queued', 'task_id': task_id}), 200

@app.route('/api/trigger-typecast-tts', methods=['POST'])
def trigger_typecast_tts():
    data = request.get_json()
    text_to_convert = data.get('text_to_convert')
    filename = data.get('filename')
    task_id = data.get('task_id')

    if not text_to_convert or not filename or not task_id:
        return jsonify({'error': 'Missing text_to_convert, filename, or task_id'}), 400

    task_payload = {
        'type': 'generate_tts_typecast',
        'payload': {
            'text_to_convert': text_to_convert,
            'filename': filename,
            'task_id': task_id
        }
    }
    r.rpush('puppeteer_typecast_tasks_list', json.dumps(task_payload))
    return jsonify({'status': 'Task queued', 'task_id': task_id}), 200

@app.route('/api/trigger-quiz-automation', methods=['POST'])
def trigger_quiz_automation():
    data = request.get_json()
    generated_quiz_data = data.get('generatedQuizData')
    user_input = data.get('userInput')
    task_id = data.get('task_id')
    frontend_url = data.get('frontend_url')

    if not generated_quiz_data or not user_input or not task_id or not frontend_url:
        return jsonify({'error': 'Missing generatedQuizData, userInput, task_id, or frontend_url'}), 400

    task_payload = {
        'type': 'generate_quiz_shorts',
        'payload': {
            'generatedQuizData': generated_quiz_data,
            'userInput': user_input,
            'task_id': task_id,
            'frontend_url': frontend_url
        }
    }
    r.rpush('quiz_automation_queue', json.dumps(task_payload))
    return jsonify({'status': 'Task queued', 'task_id': task_id}), 200

@app.route('/api/healthcheck-worker', methods=['POST'])
def healthcheck_worker():
    data = request.get_json()
    worker_type = data.get('worker_type')
    task_id = data.get('task_id')

    if not worker_type or not task_id:
        return jsonify({'error': 'Missing worker_type or task_id'}), 400

    redis_list_name = None
    if worker_type == 'chatgpt':
        redis_list_name = 'puppeteer_chatgpt_tasks_list'
    elif worker_type == 'typecast':
        redis_list_name = 'puppeteer_typecast_tasks_list'
    elif worker_type == 'general':
        redis_list_name = 'puppeteer_general_tasks_list'
    else:
        return jsonify({'error': 'Invalid worker_type'}), 400

    task_payload = {
        'type': 'healthcheck',
        'payload': {
            'task_id': task_id
        }
    }
    r.rpush(redis_list_name, json.dumps(task_payload))
    return jsonify({'status': 'Healthcheck task queued', 'task_id': task_id}), 200

# Ensure the models directory exists for sentence-transformers to download models
# This is a workaround for potential issues with model caching in some environments
if not os.path.exists('./munjero_rag_system/models'):
    os.makedirs('./munjero_rag_system/models')