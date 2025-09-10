import asyncio
import websockets
import json
import redis # Synchronous Redis client
import redis.asyncio as aredis # Asynchronous Redis client
import threading
import sys
import logging
import time

import uuid

# Configure detailed logging
logging.basicConfig(
    level=logging.INFO,
    stream=sys.stdout,
    format='[%(levelname)s] %(name)s: %(message)s'
)

# --- Global State ---
connected_clients = set()
main_event_loop = None
AGENT_COMMANDS_LIST = 'agent_commands_list'
EXTENSION_RESPONSES_LIST = 'extension_responses_list'
EXTENSION_STATUS_KEY = 'extension_connection_status'

# New Redis Key for global extension ready status
GLOBAL_EXTENSION_READY_KEY = 'global_extension_ready_status'

# Health Check related global variables
last_extension_pong_time = 0 # Timestamp of the last PONG received from an extension
dashboard_backend_websockets = set() # To store all WebSocket connections from Dashboard backends for health checks

async def broadcast_to_clients(message: str, exclude_client=None):
    logging.info(f"Attempting to broadcast message to {len(connected_clients)} connected clients.")
    if not connected_clients:
        logging.warning("No clients connected, cannot broadcast.")
        return

    targets = [client for client in connected_clients if client != exclude_client]
    logging.info(f"Broadcasting to {len(targets)} target clients.")

    tasks = [client.send(message) for client in targets]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for result, client in zip(results, list(targets)): # Iterate over targets, not connected_clients
        if isinstance(result, Exception):
            logging.warning(f"Failed to send message to client {client.remote_address}: {result}")

    logging.info(f"-> Broadcast completed for message: {message}")

def redis_listener_thread(loop):
    """Listens to Redis in a blocking way and schedules broadcasts on the main event loop."""
    logging.info("Redis listener thread started.")
    # Use the synchronous redis client here
    redis_client = redis.Redis(host='redis', port=6379, db=0, decode_responses=True)
    logging.info("Redis listener connected successfully.")

    while True:
        try:
            logging.info("Redis listener: Loop starting, waiting for command on AGENT_COMMANDS_LIST...")
            _, command_json = redis_client.brpop(AGENT_COMMANDS_LIST)
            logging.info(f"Redis listener thread popped command: {command_json}")
            
            if command_json:
                asyncio.run_coroutine_threadsafe(broadcast_to_clients(command_json), loop)

        except redis.exceptions.ConnectionError as e:
            logging.error(f"Redis connection error in listener thread: {e}. Retrying in 5s.")
            time.sleep(5)
        except Exception as e:
            logging.error(f"An error occurred in redis_listener_thread: {e}", exc_info=True)

DOM_READY_STATUS_KEY = 'extension_dom_ready_status'

async def register_client(websocket):
    """Handles individual client connections."""
    logging.info(f"Connection handler started for {websocket.remote_address}")
    aredis_client = aredis.Redis(host='redis', port=6379, db=0, decode_responses=True)

    # Generate a unique key for this client's status
    client_status_key = f"{EXTENSION_STATUS_KEY}:{websocket.remote_address}"
    client_dom_ready_key = f"{DOM_READY_STATUS_KEY}:{websocket.remote_address}"

    try:
        connected_clients.add(websocket)
        # Set initial status for this specific client in Redis on connection
        await aredis_client.set(client_status_key, 'connected')
        await aredis_client.set(client_dom_ready_key, 'false') # Initially false
        logging.info(f"Client {websocket.remote_address} status set to 'connected' and DOM ready to 'false'")
        logging.info(f"Client {websocket.remote_address} connected. Total clients: {len(connected_clients)}")

        async for message in websocket:
            logging.info(f"<- Received message from {websocket.remote_address}: {message}")
            try:
                data = json.loads(message)

                if data.get('type') == 'HEALTHCHECK_PING':
                    logging.info("Received HEALTHCHECK_PING from Dashboard backend. Broadcasting PING to extensions.")
                    dashboard_backend_websockets.add(websocket) # Add this connection to the set
                    await broadcast_to_clients(json.dumps({"type": "PING", "timestamp": time.time()}), exclude_client=websocket)
                elif data.get('type') == 'PONG':
                    logging.info(f"Received PONG from extension {websocket.remote_address}. Updating timestamp.")
                    global last_extension_pong_time
                    last_extension_pong_time = time.time()
                    # NEW: Record last PONG time in Redis
                    await aredis_client.set("extension_last_pong", time.time())
                    # Broadcast EXTENSION_PONG_RECEIVED to all connected dashboard backends
                    for db_ws in list(dashboard_backend_websockets):
                        try:
                            await db_ws.send(json.dumps({"type": "EXTENSION_PONG_RECEIVED", "timestamp": time.time()}))
                            logging.info(f"Sent EXTENSION_PONG_RECEIVED to Dashboard backend {db_ws.remote_address}.")
                        except websockets.exceptions.ConnectionClosedOK:
                            logging.info(f"Dashboard backend WebSocket connection {db_ws.remote_address} already closed, removing.")
                            dashboard_backend_websockets.remove(db_ws)
                        except Exception as e:
                            logging.error(f"Error sending EXTENSION_PONG_RECEIVED to {db_ws.remote_address}: {e}")
                            dashboard_backend_websockets.remove(db_ws) # Remove on other errors too
                elif data.get('type') == 'INIT_PING':
                    logging.info("Received INIT_PING. Sending INIT_ACK.")
                    await websocket.send(json.dumps({"type": "INIT_ACK", "status": "ready", "capabilities": ["text", "image"]}))
                elif data.get('type') == 'EXTENSION_READY':
                    logging.info(f"Received EXTENSION_READY from {websocket.remote_address}. Setting global ready status.")
                    await aredis_client.set(GLOBAL_EXTENSION_READY_KEY, 'true')
                elif data.get('type') == 'DOM_READY':
                    logging.info(f"Received DOM_READY. Details: {data.get('details')}")
                    await aredis_client.set(client_dom_ready_key, 'true')
                    logging.info(f"Client {websocket.remote_address} DOM_READY_STATUS_KEY set to 'true'")
                elif data.get('type') == 'CHATGPT_OUTPUT':
                    logging.info("Received CHATGPT_OUTPUT. Pushing task to agent and re-broadcasting.")
                    
                    image_url = data.get('payload')
                    if image_url:
                        new_script_id = str(uuid.uuid4())
                        
                        # 1. Push a task for the agent to store the image
                        agent_task = {
                            "type": "store_generated_image",
                            "script_id": new_script_id,
                            "image_url": image_url
                        }
                        await aredis_client.lpush(AGENT_TASKS_LIST, json.dumps(agent_task))
                        logging.info(f"Pushed store_generated_image task to agent with script_id: {new_script_id}")

                        # 2. Re-broadcast as SCRIPT_GENERATED for any other listeners
                        script_message = {
                            "type": "SCRIPT_GENERATED",
                            "payload": {
                                "script_id": new_script_id,
                                "script": image_url
                            }
                        }
                        await broadcast_to_clients(json.dumps(script_message))
                    else:
                        logging.warning("CHATGPT_OUTPUT received without a payload.")
                elif data.get('type') == 'KEEP_ALIVE':
                    logging.info(f"Received KEEP_ALIVE from {websocket.remote_address}. Timestamp: {data.get('timestamp')}")
                else:
                    logging.info(f"Received unhandled message type: {data.get('type')}. Pushing to Redis.")
                    await aredis_client.lpush(EXTENSION_RESPONSES_LIST, json.dumps(data))

            except json.JSONDecodeError:
                logging.warning(f"Received non-JSON message: {message}")

    except websockets.exceptions.ConnectionClosed as e:
        logging.info(f"Connection with {websocket.remote_address} closed: {e}")
    finally:
        connected_clients.remove(websocket)
        # If the disconnected client was a dashboard backend, remove it from the set
        if websocket in dashboard_backend_websockets:
            dashboard_backend_websockets.remove(websocket)
            logging.info(f"Dashboard backend WebSocket connection {websocket.remote_address} closed.")

        # Delete specific client status keys on disconnect
        await aredis_client.delete(client_status_key)
        await aredis_client.delete(client_dom_ready_key)
        logging.info(f"Client {websocket.remote_address} status keys deleted from Redis.")

        if not connected_clients:
            # Only set global disconnected if no clients are left
            await aredis_client.set(EXTENSION_STATUS_KEY, 'disconnected')
            await aredis_client.set(DOM_READY_STATUS_KEY, 'false') # Reset global DOM ready status
            await aredis_client.set(GLOBAL_EXTENSION_READY_KEY, 'false') # Set global extension ready status to false
            logging.info("Last client disconnected. Global extension status set to 'disconnected', DOM_READY_STATUS_KEY to 'false', and GLOBAL_EXTENSION_READY_KEY to 'false'.")
        logging.info(f"Client {websocket.remote_address} disconnected. Total clients: {len(connected_clients)}")
    await aredis_client.aclose()


# --- Main Application Setup ---
async def main():
    global main_event_loop
    main_event_loop = asyncio.get_running_loop()

    # Start the blocking Redis listener in a separate thread
    listener_thread = threading.Thread(
        target=redis_listener_thread,
        args=(main_event_loop,),
        daemon=True  # Allows main program to exit even if this thread is running
    )
    listener_thread.start()

    # Start the WebSocket server
    async with websockets.serve(register_client, "0.0.0.0", 8765, ping_interval=20, ping_timeout=20):
        logging.info("WebSocket server started and listening on 0.0.0.0:8765")
        await asyncio.Future()  # Run forever

if __name__ == "__main__":
    logging.info("Starting WebSocket server application...")
    asyncio.run(main())
