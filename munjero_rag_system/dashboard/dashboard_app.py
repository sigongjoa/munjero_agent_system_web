
from flask import Flask, render_template, jsonify, request
import redis
import json
import sys # Import sys for flush

app = Flask(__name__, template_folder='./templates', static_folder='./static')

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
        "type": "AGENT_COMMAND",
        "command": "send_message_to_chatgpt",
        "args": {"prompt": prompt}
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

if __name__ == "__main__":
    print("Dashboard: Starting Flask app...", flush=True, file=sys.stderr)
    app.run(host="0.0.0.0", port=5000, debug=True)
