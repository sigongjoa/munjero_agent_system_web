
import asyncio
import websockets
import json
import redis
import datetime
import sys # Import sys for flush

connected_clients = set()

# Redis client
redis_client = redis.Redis(host='redis', port=6379, db=0)

# Redis keys
AGENT_COMMANDS_LIST = 'agent_commands_list'
EXTENSION_RESPONSES_LIST = 'extension_responses_list'
EXTENSION_STATUS_KEY = 'extension_connection_status'

def log_to_redis(log_type: str, message: str):
    timestamp = datetime.datetime.now().isoformat()
    log_entry = {"timestamp": timestamp, "type": log_type, "message": message}
    redis_client.lpush('websocket_logs', json.dumps(log_entry))
    redis_client.ltrim('websocket_logs', 0, 99)
    print(f"WS_Server: Logged to Redis - Type: {log_type}, Message: {message}", flush=True, file=sys.stderr)

async def update_connection_status():
    print("WS_Server: Starting update_connection_status task.", flush=True, file=sys.stderr)
    while True:
        if connected_clients:
            redis_client.set(EXTENSION_STATUS_KEY, 'connected', ex=15)
            print("WS_Server: Set extension status to connected.", flush=True, file=sys.stderr)
        else:
            redis_client.delete(EXTENSION_STATUS_KEY)
            print("WS_Server: Deleted extension status (no clients).", flush=True, file=sys.stderr)
        await asyncio.sleep(10)

async def register_client(websocket):
    print(f"WS_Server: Client connected: {websocket.remote_address}", flush=True, file=sys.stderr)
    connected_clients.add(websocket)
    redis_client.set(EXTENSION_STATUS_KEY, 'connected', ex=15)
    log_to_redis("info", f"Extension connected: {websocket.remote_address}")
    try:
        async for message in websocket:
            try: # Added inner try block
                data = json.loads(message)
                print(f"WS_Server: Received message from client: {data}", flush=True, file=sys.stderr)
                log_to_redis("received", f"From extension: {data}")
                redis_client.lpush(EXTENSION_RESPONSES_LIST, json.dumps(data))
                print(f"WS_Server: Pushed response to EXTENSION_RESPONSES_LIST: {data}", flush=True, file=sys.stderr)
            except Exception as e: # Catch and log errors during message processing
                log_to_redis("error", f"Error processing message from {websocket.remote_address}: {e} - Message: {message}")
                print(f"WS_Server: Error processing message from {websocket.remote_address}: {e}", flush=True, file=sys.stderr)
    finally:
        connected_clients.remove(websocket)
        redis_client.delete(EXTENSION_STATUS_KEY)
        log_to_redis("info", f"Extension disconnected: {websocket.remote_address}")
        print(f"WS_Server: Client disconnected: {websocket.remote_address}", flush=True, file=sys.stderr)

async def websocket_sender():
    print("WS_Server: Starting websocket_sender task.", flush=True, file=sys.stderr)
    while True:
        try:
            print("WS_Server: Waiting for command from AGENT_COMMANDS_LIST...", flush=True, file=sys.stderr)
            _, command_json = redis_client.brpop(AGENT_COMMANDS_LIST, timeout=0)
            command_data = json.loads(command_json)
            print(f"WS_Server: Popped command from AGENT_COMMANDS_LIST: {command_data}", flush=True, file=sys.stderr)

            if connected_clients:
                print(f"WS_Server: Sending command to {len(connected_clients)} connected clients.", flush=True, file=sys.stderr)
                await asyncio.gather(*[client.send(json.dumps(command_data)) for client in connected_clients])
                log_to_redis("sent", f"To extension: {command_data}")
                print("WS_Server: Command sent to clients.", flush=True, file=sys.stderr)
            else:
                log_to_redis("warning", "No extension connected. Command put back to queue.")
                redis_client.rpush(AGENT_COMMANDS_LIST, command_json)
                print("WS_Server: No clients connected. Command pushed back to queue.", flush=True, file=sys.stderr)
        except websockets.exceptions.ConnectionClosed:
            log_to_redis("warning", "A client disconnected during send.")
            print("WS_Server: Client disconnected during send.", flush=True, file=sys.stderr)
        except Exception as e:
            log_to_redis("error", f"Error in sender: {e}")
            print(f"WS_Server: Error in sender: {e}", flush=True, file=sys.stderr)
            await asyncio.sleep(5)

async def main():
    print(">>> WS_Server: websocket_server.py started <<<", flush=True, file=sys.stderr)
    try:
        async with websockets.serve(register_client, "0.0.0.0", 8765):
            print("WS_Server: !!! websockets.serve call completed !!!", flush=True, file=sys.stderr)
            print("WS_Server: WebSocket server listening on ws://0.0.0.0:8765", flush=True, file=sys.stderr)

            sender_task = asyncio.create_task(websocket_sender())
            status_task = asyncio.create_task(update_connection_status())

            await asyncio.Future()  # run forever
    except Exception as e:
        print(f"WS_Server: Error binding WebSocket server: {e}", flush=True, file=sys.stderr)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        print(f"WS_Server: Error starting WebSocket server: {e}", flush=True, file=sys.stderr)
