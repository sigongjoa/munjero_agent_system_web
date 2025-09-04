from flask import Flask, render_template, jsonify
import redis
import json
from rq import Queue

app = Flask(__name__, template_folder='./templates', static_folder='./static')

# Redis client for accessing logs and RQ info
redis_client = redis.Redis(host='localhost', port=6379, db=0)

# RQ Queue for status
default_queue = Queue(connection=redis_client)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/rq_status')
def get_rq_status():
    try:
        # Get number of jobs in default queue
        default_queue_jobs = default_queue.count
        # Get number of active workers (simplified, might need more robust check for production)
        started_workers = len(default_queue.workers)
        return jsonify({
            "default_queue_jobs": default_queue_jobs,
            "started_workers": started_workers
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/websocket_logs')
def get_websocket_logs():
    try:
        logs = redis_client.lrange('websocket_logs', 0, 99) # Get last 100 logs
        # Decode and parse JSON logs
        parsed_logs = [json.loads(log.decode('utf-8')) for log in logs]
        return jsonify(parsed_logs)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/agent_logs')
def get_agent_logs():
    try:
        logs = redis_client.lrange('agent_logs', 0, 99) # Get last 100 logs
        # Decode and parse JSON logs
        parsed_logs = [json.loads(log.decode('utf-8')) for log in logs]
        return jsonify(parsed_logs)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
