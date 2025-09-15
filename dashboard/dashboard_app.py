import os
from flask import Flask, render_template, jsonify, request, send_from_directory
from flask_cors import CORS
import redis
import json
import sys
import httpx
import uuid
import asyncio
import websockets
import time
from scripts.websocket_server import GLOBAL_EXTENSION_READY_KEY # Import GLOBAL_EXTENSION_READY_KEY

DATA_DIR = os.path.join("/app", "data") # Define DATA_DIR here

def check_data_dir():
    try:
        if not os.path.exists(DATA_DIR):
            os.makedirs(DATA_DIR, exist_ok=True)
            print(f"[INIT] Data directory created: {DATA_DIR}", flush=True)
        test_file = os.path.join(DATA_DIR, "init_check.txt")
        with open(test_file, "w") as f:
            f.write("data-dir-ok")
        with open(test_file, "r") as f:
            check = f.read().strip()
        os.remove(test_file)
        print(f"[INIT] Data directory write/read OK: {check}", flush=True)
    except Exception as e:
        print(f"[INIT] Data directory check failed: {e}", flush=True)
        raise

# Call the check at the beginning of the script
check_data_dir()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "templates"),
    static_folder=os.path.join(BASE_DIR, "static"),
    static_url_path="/static"
)
CORS(app) # Enable CORS for all routes

# Use a standard synchronous Redis client
redis_client = redis.Redis(host='redis', port=6379, db=0, decode_responses=True)

# WebSocket server URL
WEBSOCKET_SERVER_URL = "ws://websocket_server:8765" # Use service name for Docker Compose # Ensure this matches your websocket_server.py

# --- Redis Keys ---
AGENT_TASKS_LIST = 'agent_tasks'             # Tasks for the agent to perform (e.g., generate script)
PUPPETEER_TASKS_LIST = 'puppeteer_tasks_list' # Tasks for the Puppeteer worker
EXTENSION_RESPONSES_LIST = 'extension_responses_list' # Raw responses from the extension
EXTENSION_STATUS_KEY = 'extension_connection_status'
LAST_RECEIVED_DOM_KEY = 'last_received_dom'


# --- HTML Page Routes ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/data/<path:filename>')
def serve_data_file(filename):
    """Serves files from the data directory."""
    return send_from_directory(DATA_DIR, filename)

@app.route('/dom-debugger')
def dom_debugger():
    return render_template('dom_debugger.html')

@app.route('/result')
def result_page():
    """Displays the latest generated script and images."""
    script_content = None
    image_urls = []
    
    latest_script_id = redis_client.get("latest_script_id")
    
    if latest_script_id:
        script_content = redis_client.get(f"script:{latest_script_id}")
        images_json = redis_client.get(f"images:{latest_script_id}")
        if images_json:
            try:
                image_urls = json.loads(images_json)
            except json.JSONDecodeError:
                image_urls = [] # Handle case where JSON is malformed
            
    return render_template('result.html', script_content=script_content, image_urls=image_urls)

@app.route('/send_data')
def send_data_page():
    return render_template('send_data.html')

@app.route('/dom-viewer')
def dom_viewer_page():
    return render_template('dom_viewer.html')

@app.route('/typecast_tts')
def typecast_tts_page():
    return render_template('typecast_tts.html')

@app.route('/rag')
def rag_page():
    return render_template('rag_system.html')

@app.route('/quiz_automation')
def quiz_automation_page():
    return render_template('quiz_automation.html')

@app.route('/login_management')
def login_management_page():
    return render_template('login_management.html')


# --- API Endpoints ---

@app.route('/api/generate-script', methods=['POST'])
def api_generate_script_and_images():
    """Receives a script from the user, saves it, and queues a task for the agent to generate images."""
    data = request.get_json()
    script_content = data.get('script_content')
    if not script_content:
        return jsonify({"error": "Script content is required"}), 400
    
    # Create a new ID for this script and task
    script_id = str(uuid.uuid4())
    
    # 1. Save the user-provided script to Redis
    redis_client.set(f"script:{script_id}", script_content)
    print(f"Dashboard: Saved user-provided script {script_id} to Redis.", flush=True, file=sys.stderr)

    # Store this ID as the latest one so the result page can find it
    redis_client.set("latest_script_id", script_id)
    
    # 2. Queue a task for the agent to generate images for this script
    task = {
        "type": "generate_images",
        "script_id": script_id,
        "task_id": script_id  # Use the same ID for simplicity in polling
    }
    
    redis_client.lpush(AGENT_TASKS_LIST, json.dumps(task))
    print(f"Dashboard: Queued task {script_id} for image generation.", flush=True, file=sys.stderr)
    
    # Return the ID so the frontend can start polling for images
    return jsonify({"message": "Image generation task queued", "task_id": script_id}), 202

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

@app.route('/api/task-status/<task_id>', methods=['GET'])
def get_task_status(task_id):
    """
    Retrieves the status and result of a given task ID from Redis.
    """
    status = redis_client.get(f"task:{task_id}:status")
    result = redis_client.get(f"task:{task_id}:result")

    if status is None:
        return jsonify({"status": "not_found", "message": "Task not found or not started yet."}), 404

    response_data = {"status": status}
    if result:
        try:
            response_data["result"] = json.loads(result)
        except json.JSONDecodeError:
            response_data["result"] = result # Return as string if not valid JSON
    else:
        response_data["result"] = None

    return jsonify(response_data), 200

@app.route('/api/send_prompt', methods=['POST'])
def send_prompt_to_puppeteer_worker():
    """Sends a prompt to the Puppeteer worker to be executed in a headless browser."""
    data = request.get_json()
    prompt = data.get('prompt')
    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400
    
    task = {
        "type": "send_prompt",
        "payload": {
            "prompt": prompt,
            "request_id": str(uuid.uuid4())
        }
    }
    
    redis_client.lpush(PUPPETEER_TASKS_LIST, json.dumps(task))
    print(f"Dashboard: Pushing task to Puppeteer worker: {json.dumps(task)}", flush=True, file=sys.stderr)
    return jsonify({"message": f"Task for prompt '{prompt}' sent to Puppeteer worker."}), 200

@app.route('/api/manual_login_setup', methods=['POST'])
def api_manual_login_setup():
    """
    Queues a 'manual_login_setup' task for the Puppeteer Worker.
    """
    task_id = str(uuid.uuid4())
    task = {
        "type": "manual_login_setup",
        "payload": {
            "task_id": task_id
        }
    }

    redis_client.lpush('puppeteer_chatgpt_tasks_list', json.dumps(task))
    print(f"Dashboard: Queued manual login setup task (Task ID: {task_id})", flush=True, file=sys.stderr)
    return jsonify({"message": "Manual login setup task queued", "task_id": task_id}), 202

@app.route('/api/manual_login_setup_typecast', methods=['POST'])
def api_manual_login_setup_typecast():
    """
    Queues a 'manual_login_setup_typecast' task for the Puppeteer Typecast Worker.
    """
    task_id = str(uuid.uuid4())
    task = {
        "type": "manual_login_setup_typecast",
        "payload": {
            "task_id": task_id
        }
    }

    redis_client.lpush('puppeteer_typecast_tasks_list', json.dumps(task))
    print(f"Dashboard: Queued manual login setup task for Typecast (Task ID: {task_id})", flush=True, file=sys.stderr)
    return jsonify({"message": "Manual login setup task for Typecast queued", "task_id": task_id}), 202

@app.route('/api/start_browser_login', methods=['POST'])
def api_start_browser_login():
    """
    Queues a 'browser_login' task for the Puppeteer Worker to open a browser for manual login.
    """
    data = request.get_json()
    profile_name = data.get('profile_name', 'default') # Default to 'default' if not provided

    task_id = str(uuid.uuid4())
    task = {
        "type": "browser_login",
        "payload": {
            "profile_name": profile_name,
            "task_id": task_id
        }
    }

    redis_client.lpush(PUPPETEER_TASKS_LIST, json.dumps(task))
    print(f"Dashboard: Queued browser login task for profile '{profile_name}' (Task ID: {task_id})", flush=True, file=sys.stderr)
    return jsonify({"message": "Browser login task queued", "task_id": task_id}), 202

@app.route('/api/crawl_dom', methods=['POST'])
def api_crawl_dom():
    """
    Receives a URL, queues a 'dom_crawl' task for the Puppeteer Worker,
    and returns a task_id for polling.
    """
    data = request.get_json()
    url = data.get('url')
    if not url:
        return jsonify({"error": "URL is required"}), 400

    task_id = str(uuid.uuid4())
    task = {
        "type": "dom_crawl",
        "payload": {
            "url": url,
            "task_id": task_id
        }
    }
    
    redis_client.lpush(PUPPETEER_TASKS_LIST, json.dumps(task))
    print(f"Dashboard: Queued DOM crawl task for URL: {url} (Task ID: {task_id})", flush=True, file=sys.stderr)
    return jsonify({"message": "DOM crawl task queued", "task_id": task_id}), 202

@app.route('/api/dom_crawl_result/<task_id>', methods=['GET'])
def api_get_dom_crawl_result(task_id):
    """
    Retrieves the result of a DOM crawl task from Redis.
    """
    dom_data_json = redis_client.get(f"puppeteer_domdump:{task_id}")
    if dom_data_json:
        try:
            dom_data = json.loads(dom_data_json)
            return jsonify({"status": "completed", "result": dom_data}), 200
        except json.JSONDecodeError:
            return jsonify({"status": "error", "message": "Failed to decode DOM data from Redis."}), 500
    else:
        # Task might still be processing or not found
        return jsonify({"status": "processing", "message": "DOM crawl data not yet available or task not found."}), 202

@app.route('/api/generate_image_task', methods=['POST'])
def api_generate_image_task():
    """
    Receives a prompt, queues a 'generate_image_from_prompt' task for the Puppeteer Worker,
    and returns a task_id for polling.
    """
    data = request.get_json()
    prompt = data.get('prompt')
    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400

    task_id = str(uuid.uuid4())
    task = {
        "type": "generate_image_from_prompt",
        "payload": {
            "prompt": prompt,
            "task_id": task_id
        }
    }

    # Server-side safeguard against duplicate tasks
    # Check if a similar task was recently queued (e.g., within the last 5 seconds)
    # This is a simple check and can be made more sophisticated if needed.
    last_task_key = f"last_puppeteer_task:{prompt}"
    last_task_timestamp = redis_client.get(last_task_key)

    if last_task_timestamp and (time.time() - float(last_task_timestamp)) < 5: # 5 seconds debounce
        print(f"Dashboard: Duplicate task for prompt '{prompt}' detected and ignored.", flush=True, file=sys.stderr)
        return jsonify({"message": "Duplicate task detected and ignored."}), 200 # Return 200 OK to avoid frontend error

    redis_client.lpush(PUPPETEER_TASKS_LIST, json.dumps(task))
    redis_client.set(last_task_key, time.time()) # Update timestamp for this prompt
    print(f"Dashboard: Queued image generation task for prompt: '{prompt}' (Task ID: {task_id})", flush=True, file=sys.stderr)
    return jsonify({"message": "Image generation task queued", "task_id": task_id}), 202

@app.route('/api/image_generation_result/<task_id>', methods=['GET'])
def api_get_image_generation_result(task_id):
    """
    Retrieves the result of an image generation task from Redis.
    """
    image_result_json = redis_client.get(f"puppeteer_image_generation_result:{task_id}")
    if image_result_json:
        try:
            image_result = json.loads(image_result_json)
            return jsonify({"status": "completed", "result": image_result}), 200
        except json.JSONDecodeError:
            return jsonify({"status": "error", "message": "Failed to decode image generation result from Redis."}), 500
    else:
        # Task might still be processing or not found
        return jsonify({"status": "processing", "message": "Image generation result not yet available or task not found."}), 202

import io
import csv
from flask import Response, send_file

def convert_dom_to_csv(dom_elements):
    """
    Converts a list of DOM element dictionaries into a CSV string.
    """
    output = io.StringIO()
    writer = csv.writer(output)

    headers = ["Tag", "ID", "Classes", "Selector", "Text", "Attributes"]
    writer.writerow(headers)

    for el in dom_elements:
        tag = el.get("tag", "")
        el_id = el.get("id", "")
        classes = " ".join(el.get("classes", [])) if el.get("classes") else ""
        selector = el.get("selector", "")
        text = el.get("text", "")
        
        attributes_list = el.get("attributes", [])
        attributes_str = "; ".join([f"{attr['name']}='{attr['value']}'" for attr in attributes_list])

        writer.writerow([tag, el_id, classes, selector, text, attributes_str])
    
    return output.getvalue()

@app.route('/api/download_dom_csv/<task_id>', methods=['GET'])
def api_download_dom_csv(task_id):
    """
    Retrieves DOM crawl data from Redis and provides it as a CSV download.
    """
    dom_data_json = redis_client.get(f"puppeteer_domdump:{task_id}")
    if not dom_data_json:
        return jsonify({"error": "DOM crawl data not found or not ready."}), 404

    try:
        dom_data = json.loads(dom_data_json)
    except json.JSONDecodeError:
        return jsonify({"error": "Failed to decode DOM data from Redis."}), 500

    # Check if the data contains an 'elements' key (from the worker's new error handling)
    if "elements" in dom_data and isinstance(dom_data["elements"], list):
        elements_to_process = dom_data["elements"]
    elif isinstance(dom_data, list): # Fallback for older data or if 'elements' key is not used
        elements_to_process = dom_data
    else:
        return jsonify({"error": "Invalid DOM data format in Redis."}), 500

    csv_string = convert_dom_to_csv(elements_to_process)

    response = Response(csv_string, mimetype='text/csv')
    response.headers["Content-Disposition"] = f"attachment; filename=dom_crawl_{task_id}.csv"
    return response

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

@app.route('/api/healthcheck')
async def healthcheck():
    """
    Performs an end-to-end health check for Extension, Redis, and Agent.
    """
    health_status = {
        "redis": {"status": "unknown", "message": "Not checked"},
        "agent": {"status": "unknown", "message": "Not checked"},
        "puppeteer_worker": {"status": "unknown", "message": "Not checked"},
        "overall": "unhealthy",
        "logs": []
    }

    def log(message):
        health_status["logs"].append(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {message}")
        print(message, flush=True, file=sys.stderr)

    # --- 1. Redis Connectivity Check ---
    log("Checking Redis connectivity...")
    try:
        redis_client.ping()
        health_status["redis"]["status"] = "ok"
        health_status["redis"]["message"] = "Connected"
        log("Redis connection successful.")
    except Exception as e:
        health_status["redis"]["status"] = "error"
        health_status["redis"]["message"] = f"Connection failed: {str(e)}"
        log(f"Dashboard: Redis health check failed: {e}")

    # --- 3. Agent Health Check (via Redis task) ---
    log("Checking agent health via Redis task...")
    agent_responsive = False
    agent_healthcheck_task_id = str(uuid.uuid4())
    agent_task_timeout = 10
    agent_poll_interval = 1

    try:
        redis_client.lpush(AGENT_TASKS_LIST, json.dumps({"type": "healthcheck", "id": agent_healthcheck_task_id}))
        log(f"Queued agent healthcheck task: {agent_healthcheck_task_id}")

        start_time = time.time()
        while time.time() - start_time < agent_task_timeout:
            agent_result = redis_client.get(f"healthcheck_result:{agent_healthcheck_task_id}")
            if agent_result == "OK":
                agent_responsive = True
                redis_client.delete(f"healthcheck_result:{agent_healthcheck_task_id}")
                log(f"Agent responded to healthcheck task {agent_healthcheck_task_id}.")
                break
            await asyncio.sleep(agent_poll_interval)

        if agent_responsive:
            health_status["agent"]["status"] = "ok"
            health_status["agent"]["message"] = "Responded to task"
            log("Agent is responsive.")
        else:
            health_status["agent"]["status"] = "error"
            health_status["agent"]["message"] = "Did not respond to task in time"
            log("Agent did not respond to the healthcheck task in time.")

    except Exception as e:
        health_status["agent"]["status"] = "error"
        health_status["agent"]["message"] = f"Task queuing failed: {str(e)}"
        log(f"Agent health check task queuing failed: {e}")

    # --- Puppeteer Worker Health Check ---
    log("Checking Puppeteer Worker health via Redis task...")
    puppeteer_responsive = False
    puppeteer_healthcheck_task_id = str(uuid.uuid4())
    puppeteer_task_timeout = 15 # seconds for puppeteer to respond
    puppeteer_poll_interval = 1 # seconds

    try:
        # Push healthcheck task to Puppeteer Worker
        puppeteer_task = {
            "type": "healthcheck",
            "id": puppeteer_healthcheck_task_id
        }
        redis_client.lpush(PUPPETEER_TASKS_LIST, json.dumps(puppeteer_task))
        log(f"Queued Puppeteer worker healthcheck task: {puppeteer_healthcheck_task_id}")

        start_time = time.time()
        while time.time() - start_time < puppeteer_task_timeout:
            # Log the key being queried
            log(f"Dashboard: Checking Redis key: puppeteer_healthcheck_result:{puppeteer_healthcheck_task_id}")
            puppeteer_result = redis_client.get(f"puppeteer_healthcheck_result:{puppeteer_healthcheck_task_id}")
            if puppeteer_result:
                try:
                    puppeteer_result_json = json.loads(puppeteer_result)
                    if puppeteer_result_json.get("status") == "ok":
                        puppeteer_responsive = True
                        redis_client.delete(f"puppeteer_healthcheck_result:{puppeteer_healthcheck_task_id}") # Clean up
                        log(f"Puppeteer worker responded to healthcheck task {puppeteer_healthcheck_task_id}. Result: {puppeteer_result}")
                        break
                except json.JSONDecodeError:
                    log(f"Dashboard: Failed to decode JSON from Redis for Puppeteer worker healthcheck. Value: {puppeteer_result}")
            await asyncio.sleep(puppeteer_poll_interval)

        if puppeteer_responsive:
            health_status["puppeteer_worker"]["status"] = "ok"
            health_status["puppeteer_worker"]["message"] = "Responded to task"
            log("Puppeteer worker is responsive.")
        else:
            health_status["puppeteer_worker"]["status"] = "error"
            health_status["puppeteer_worker"]["message"] = "Did not respond to task in time"
            log("Puppeteer worker did not respond to the healthcheck task in time.")

    except Exception as e:
        health_status["puppeteer_worker"]["status"] = "error"
        health_status["puppeteer_worker"]["message"] = f"Task queuing failed: {str(e)}"
        log(f"Puppeteer worker health check task queuing failed: {e}")

    # --- 5. Overall Health Status ---
    if (health_status["redis"]["status"] == "ok" and
        health_status["agent"]["status"] == "ok" and
        health_status["puppeteer_worker"]["status"] == "ok"):
        health_status["overall"] = "healthy"
    else:
        health_status["overall"] = "unhealthy"

    # Read Puppeteer worker logs and add to health_status
    puppeteer_log_path = "/app/puppeteer_worker_logs.txt" # This path is relative to the Docker container's /app
    try:
        if os.path.exists(puppeteer_log_path):
            with open(puppeteer_log_path, 'r') as f:
                log_content = f.readlines()
                health_status["logs"].extend([f"[PUPPETEER_LOG] {line.strip()}" for line in log_content])
        else:
            health_status["logs"].append(f"[PUPPETEER_LOG] Log file not found at {puppeteer_log_path}")
    except Exception as e:
        health_status["logs"].append(f"[PUPPETEER_LOG] Error reading log file: {str(e)}")

    return jsonify(health_status)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)