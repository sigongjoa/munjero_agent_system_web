
from flask import Flask, render_template, jsonify, request
import redis
import json
import sys # Import sys for flush
import httpx
from bs4 import BeautifulSoup
from flask_cors import CORS

app = Flask(__name__, template_folder='./templates', static_folder='./static')
CORS(app) # Enable CORS for all routes

# Redis client
redis_client = redis.Redis(host='redis', port=6379, db=0)

# Redis Keys
AGENT_COMMANDS_LIST = 'agent_commands_list'
EXTENSION_RESPONSES_LIST = 'extension_responses_list'

@app.route('/')
def index():
    print("Dashboard: / route accessed", flush=True, file=sys.stderr)
    return render_template('index.html')

@app.route('/api/direct_send_to_extension', methods=['POST'])
def direct_send_to_extension():
    print("Dashboard: /api/direct_send_to_extension POST request received", flush=True, file=sys.stderr)
    data = request.get_json()
    prompt = data.get('prompt')
    if not prompt:
        print("Dashboard: Prompt is missing", flush=True, file=sys.stderr)
        return jsonify({"error": "Prompt is required"}), 400
    
    command = {
        "type": "SEND_TO_CHATGPT",
        "payload": prompt
    }
    print(f"Dashboard: Pushing command to AGENT_COMMANDS_LIST: {command}", flush=True, file=sys.stderr)
    redis_client.lpush(AGENT_COMMANDS_LIST, json.dumps(command))
    print("Dashboard: Command pushed to Redis", flush=True, file=sys.stderr)
    return jsonify({"message": f"Command '{prompt}' sent to extension."}), 200

@app.route('/api/get_extension_response')
def get_extension_response():
    print("Dashboard: /api/get_extension_response GET request received. Waiting for response...", flush=True, file=sys.stderr)
    try:
        _, response_json = redis_client.brpop(EXTENSION_RESPONSES_LIST, timeout=25)
        if response_json:
            response_data = json.loads(response_json)
            print(f"Dashboard: Received response from EXTENSION_RESPONSES_LIST: {response_data}", flush=True, file=sys.stderr)
            return jsonify(response_data)
        else:
            print("Dashboard: brpop timed out. No response from extension.", flush=True, file=sys.stderr)
            return jsonify({"error": "Request timed out."}), 408
    except Exception as e:
        print(f"Dashboard: Error in get_extension_response: {e}", flush=True, file=sys.stderr)
        return jsonify({"error": str(e)}), 500

@app.route('/api/extension_status')
def get_extension_status():
    print("Dashboard: /api/extension_status GET request received", flush=True, file=sys.stderr)
    status = redis_client.get('extension_connection_status')
    if status == b'connected':
        print("Dashboard: Extension status: Connected", flush=True, file=sys.stderr)
        return jsonify({"status": "connected", "message": "Chrome Extension is connected."})
    else:
        print("Dashboard: Extension status: Disconnected", flush=True, file=sys.stderr)
        return jsonify({"status": "disconnected", "message": "Chrome Extension is not connected."})

@app.route('/dom-debugger')
def dom_debugger():
    print("Dashboard: /dom-debugger route accessed", flush=True, file=sys.stderr)
    return render_template('dom_debugger.html')

@app.route('/fetch-dom', methods=['POST'])
def fetch_dom():
    print("Dashboard: /fetch-dom POST request received", flush=True, file=sys.stderr)
    data = request.get_json()
    url = data.get('url')

    if not url:
        print("Dashboard: URL is missing", flush=True, file=sys.stderr)
        return jsonify({"error": "URL is required"}), 400

    try:
        # Use httpx to fetch the URL content
        # Follow redirects by default
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
        }
        response = httpx.get(url, headers=headers, follow_redirects=True, timeout=10)
        response.raise_for_status() # Raise an exception for HTTP errors (4xx or 5xx)
        
        # For now, just return the raw HTML. Parsing will be added in Phase 2.
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Extract relevant input fields
        input_fields = []
        for tag in soup.find_all(['input', 'textarea']):
            field_info = {
                'tag': tag.name,
                'type': tag.get('type', 'text') if tag.name == 'input' else tag.name,
                'name': tag.get('name'),
                'id': tag.get('id'),
                'class': tag.get('class'),
                'placeholder': tag.get('placeholder'),
                'value': tag.get('value'),
                'selector': None # Placeholder for CSS selector
            }
            # Generate a simple CSS selector for identification
            if field_info['id']:
                field_info['selector'] = f"#{field_info['id']}"
            elif field_info['name']:
                field_info['selector'] = f"[name='{field_info['name']}']"
            elif field_info['class']:
                field_info['selector'] = f".{' '.join(field_info['class'])}"
            
            input_fields.append(field_info)

        print(f"Dashboard: Successfully fetched and parsed URL: {url}", flush=True, file=sys.stderr)
        return jsonify({"html": response.text, "input_fields": input_fields}), 200

    except httpx.RequestError as e:
        print(f"Dashboard: Request error fetching {url}: {e}", flush=True, file=sys.stderr)
        return jsonify({"error": f"Network error or invalid URL: {e}"}), 500
    except httpx.HTTPStatusError as e:
        print(f"Dashboard: HTTP error fetching {url}: {e.response.status_code}", flush=True, file=sys.stderr)
        return jsonify({"error": f"HTTP error: {e.response.status_code} - {e.response.reason_phrase}"}), 500
    except Exception as e:
        print(f"Dashboard: An unexpected error occurred: {e}", flush=True, file=sys.stderr)
        return jsonify({"error": f"An unexpected error occurred: {e}"}), 500

LAST_RECEIVED_DOM_KEY = 'last_received_dom'

@app.route('/api/receive-dom-from-extension', methods=['POST'])
def receive_dom_from_extension():
    print("Dashboard: /api/receive-dom-from-extension POST request received", flush=True, file=sys.stderr)
    data = request.get_json()
    dom_content = data.get('dom')
    source_url = data.get('url')

    if not dom_content:
        print("Dashboard: DOM content is missing", flush=True, file=sys.stderr)
        return jsonify({"error": "DOM content is required"}), 400

    # Store the received DOM content in Redis
    redis_client.set(LAST_RECEIVED_DOM_KEY, json.dumps({'html': dom_content, 'url': source_url}))
    print(f"Dashboard: Received DOM from extension for URL: {source_url}", flush=True, file=sys.stderr)
    return jsonify({"message": "DOM received and stored successfully."}), 200

@app.route('/api/get-last-received-dom', methods=['GET'])
def get_last_received_dom():
    print("Dashboard: /api/get-last-received-dom GET request received", flush=True, file=sys.stderr)
    stored_data = redis_client.get(LAST_RECEIVED_DOM_KEY)
    if stored_data:
        data = json.loads(stored_data)
        print(f"Dashboard: Returning last received DOM for URL: {data.get('url')}", flush=True, file=sys.stderr)
        return jsonify(data), 200
    else:
        print("Dashboard: No DOM content found in Redis.", flush=True, file=sys.stderr)
        return jsonify({"error": "No DOM content available."}), 404

@app.route('/send_data')
def send_data_page():
    print("Dashboard: /send_data route accessed", flush=True, file=sys.stderr)
    return render_template('send_data.html')

if __name__ == "__main__":
    print("Dashboard: Starting Flask app...", flush=True, file=sys.stderr)
    app.run(host="0.0.0.0", port=5000, debug=True)
