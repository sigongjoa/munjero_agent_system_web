from flask import Flask, render_template, jsonify, request
import redis
import json
import sys
import os
import httpx
from flask_cors import CORS
import uuid

# This app is now fully synchronous. No more asyncio conflicts.

app = Flask(__name__, template_folder='./templates', static_folder='./static')
CORS(app) # Enable CORS for all routes

# Use a standard synchronous Redis client
redis_client = redis.Redis(host='redis', port=6379, db=0, decode_responses=True)

# --- Redis Keys ---
AGENT_TASKS_LIST = 'agent_tasks'             # Tasks for the agent to perform (e.g., generate script)
AGENT_COMMANDS_LIST = 'agent_commands_list'  # Low-level commands for the extension (e.g., type this)
EXTENSION_RESPONSES_LIST = 'extension_responses_list' # Raw responses from the extension
EXTENSION_STATUS_KEY = 'extension_connection_status'
LAST_RECEIVED_DOM_KEY = 'last_received_dom'


# --- HTML Page Routes ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/dom-debugger')
def dom_debugger():
    return render_template('dom_debugger.html')

@app.route('/send_data')
def send_data_page():
    return render_template('send_data.html')


# --- API Endpoints ---

@app.route('/api/generate-script', methods=['POST'])
def api_generate_script():
    """Queues a task for the agent to generate a script."""
    data = request.get_json()
    topic = data.get('topic')
    if not topic:
        return jsonify({"error": "Topic is required"}), 400
    
    task_id = str(uuid.uuid4())
    task = {
        "type": "generate_script",
        "topic": topic,
        "task_id": task_id
    }
    
    redis_client.lpush(AGENT_TASKS_LIST, json.dumps(task))
    print(f"Dashboard: Queued task {task_id} for topic '{topic}'", flush=True, file=sys.stderr)
    return jsonify({"message": "Script generation task queued", "task_id": task_id}), 202

@app.route('/api/generate-images', methods=['POST'])
def api_generate_images():
    """Queues a task for the agent to generate images."""
    data = request.get_json()
    script_id = data.get('script_id')
    if not script_id:
        return jsonify({"error": "Script ID is required"}), 400

    task_id = str(uuid.uuid4())
    task = {
        "type": "generate_images",
        "script_id": script_id,
        "task_id": task_id
    }
    
    redis_client.lpush(AGENT_TASKS_LIST, json.dumps(task))
    print(f"Dashboard: Queued task {task_id} for script '{script_id}'", flush=True, file=sys.stderr)
    return jsonify({"message": "Image generation task queued", "task_id": task_id}), 202

@app.route('/api/script/<script_id>', methods=['GET'])
def api_get_script(script_id):
    """Gets the result of a script generation task."""
    script = redis_client.get(f"script:{script_id}")
    if script:
        return jsonify({"script_id": script_id, "content": script}), 200
    else:
        return jsonify({"error": "Script not found or not ready yet"}), 404

@app.route('/api/images/<script_id>', methods=['GET'])
def api_get_images(script_id):
    """Gets the result of an image generation task."""
    images_json = redis_client.get(f"images:{script_id}")
    if images_json:
        image_urls = json.loads(images_json)
        return jsonify({"script_id": script_id, "image_urls": image_urls}), 200
    else:
        return jsonify({"error": "Images not found or not ready yet"}), 404

@app.route('/api/direct_send_to_extension', methods=['POST'])
def direct_send_to_extension():
    """Sends a raw prompt directly to the extension via the websocket server."""
    data = request.get_json()
    prompt = data.get('prompt')
    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400
    
    command = {
        "type": "SEND_TO_CHATGPT",
        "payload": {
            "prompt": prompt,
            "request_id": str(uuid.uuid4())
        }
    }
    print(f"Dashboard (direct_send_to_extension): Pushing command to Redis: {json.dumps(command)}", flush=True, file=sys.stderr)
    redis_client.lpush(AGENT_COMMANDS_LIST, json.dumps(command))
    return jsonify({"message": f"Command '{prompt}' sent to extension."}), 200

@app.route('/api/extension_status')
def get_extension_status():
    """Checks if the websocket server has a connection from the extension."""
    status = redis_client.get(EXTENSION_STATUS_KEY)
    if status == 'connected':
        return jsonify({"status": "connected", "message": "Chrome Extension is connected."})
    else:
        return jsonify({"status": "disconnected", "message": "Chrome Extension is not connected."})

@app.route('/api/update_extension_status', methods=['POST'])
def update_extension_status():
    """Receives extension connection status updates and stores them in Redis."""
    data = request.get_json()
    status = data.get('status')
    if not status:
        return jsonify({"error": "Status is required"}), 400
    
    if status in ['connected', 'disconnected']:
        redis_client.set(EXTENSION_STATUS_KEY, status)
        print(f"Dashboard: Received extension status update: {status}", flush=True, file=sys.stderr)
        return jsonify({"message": f"Extension status set to {status}"}), 200
    else:
        return jsonify({"error": "Invalid status provided"}), 400

@app.route('/api/receive-dom-from-extension', methods=['POST'])
def receive_dom_from_extension():
    """Receives the DOM from the extension and stores it in Redis."""
    data = request.get_json()
    dom_content = data.get('dom')
    source_url = data.get('url')
    if not dom_content:
        return jsonify({"error": "DOM content is required"}), 400
    redis_client.set(LAST_RECEIVED_DOM_KEY, json.dumps({'html': dom_content, 'url': source_url}))
    return jsonify({"message": "DOM received and stored successfully."}), 200

@app.route('/api/get-last-received-dom', methods=['GET'])
def get_last_received_dom():
    """Gets the last DOM received from the extension."""
    stored_data = redis_client.get(LAST_RECEIVED_DOM_KEY)
    if stored_data:
        return jsonify(json.loads(stored_data)), 200
    else:
        return jsonify({"error": "No DOM content available."}), 404

@app.route('/api/worker_status', methods=['GET'])
def get_worker_status():
    """Checks the status of the agent worker."""
    status = redis_client.get('worker_status')
    return jsonify({"status": status or "not_ready"}), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
