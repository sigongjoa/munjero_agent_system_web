import asyncio
import websockets
import json
import redis
import datetime

connected_clients = set() # To keep track of active WebSocket connections

# Redis client for logging and inter-service communication
redis_client = redis.Redis(host='redis', port=6379, db=0)

# Redis List names for communication
AGENT_COMMANDS_LIST = 'agent_commands_list'
EXTENSION_RESPONSES_LIST = 'extension_responses_list'

def log_to_redis(log_type: str, message: str):
    timestamp = datetime.datetime.now().isoformat()
    log_entry = {"timestamp": timestamp, "type": log_type, "message": message}
    redis_client.lpush('websocket_logs', json.dumps(log_entry))
    # Keep the list size manageable, e.g., last 100 entries
    redis_client.ltrim('websocket_logs', 0, 99)

async def register_client(websocket):
    connected_clients.add(websocket)
    log_to_redis("info", f"Extension connected: {websocket.remote_address}")
    try:
        async for message in websocket:
            data = json.loads(message)
            log_to_redis("received", f"From extension: {data}")
            # Put extension response into Redis List for Agent AI
            redis_client.lpush(EXTENSION_RESPONSES_LIST, json.dumps(data))
    finally:
        connected_clients.remove(websocket)
        log_to_redis("info", f"Extension disconnected: {websocket.remote_address}")

# This function will be called by the Agent AI to put commands into Redis
# It's not directly used in websocket_server.py, but defined for clarity
# as it's the counterpart to websocket_sender
async def send_command_to_extension(command_data: dict):
    redis_client.lpush(AGENT_COMMANDS_LIST, json.dumps(command_data))

async def websocket_sender():
    # This task continuously sends commands from Redis List to extensions
    while True:
        # Blocking pop from Redis List
        # timeout=0 means block indefinitely until an item is available
        _, command_json = redis_client.brpop(AGENT_COMMANDS_LIST, timeout=0)
        command_data = json.loads(command_json)

        if connected_clients:
            for client in connected_clients:
                try:
                    await client.send(json.dumps(command_data))
                    log_to_redis("sent", f"To extension: {command_data}")
                except websockets.exceptions.ConnectionClosedOK:
                    log_to_redis("warning", "Client disconnected while sending.")
                except Exception as e:
                    log_to_redis("error", f"Error sending to client: {e}")
        else:
            log_to_redis("warning", "No Chrome Extension connected to send command. Command put back to queue.")
            # If no clients, put the command back to the right of the list
            redis_client.rpush(AGENT_COMMANDS_LIST, command_json)


async def main():
    # Start WebSocket server on port 8000
    websocket_server = websockets.serve(register_client, "localhost", 8000)
    log_to_redis("info", "WebSocket server started on ws://localhost:8000/ws")

    # Start the sender task
    sender_task = asyncio.create_task(websocket_sender())

    await asyncio.gather(websocket_server, sender_task)

if __name__ == "__main__":
    asyncio.run(main())