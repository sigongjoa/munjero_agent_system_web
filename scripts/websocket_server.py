import asyncio
import websockets
import json
import redis # Synchronous Redis client
import redis.asyncio as aredis # Asynchronous Redis client
import threading
import sys
import logging
import time

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

async def broadcast_to_clients(message: str):
    if not connected_clients:
        logging.warning("No clients connected, cannot broadcast.")
        return

    logging.debug(f"Broadcasting message to {len(connected_clients)} client(s)...")
    
    tasks = [client.send(message) for client in connected_clients]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for result, client in zip(results, list(connected_clients)):
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
            logging.debug("Waiting for command from Redis (blocking pop)....")
            _, command_json = redis_client.brpop(AGENT_COMMANDS_LIST)
            
            if command_json:
                asyncio.run_coroutine_threadsafe(broadcast_to_clients(command_json), loop)

        except redis.exceptions.ConnectionError as e:
            logging.error(f"Redis connection error in listener thread: {e}. Retrying in 5s.")
            time.sleep(5)
        except Exception as e:
            logging.error(f"An error occurred in redis_listener_thread: {e}", exc_info=True)

async def register_client(websocket):
    """Handles individual client connections."""
    logging.info(f"Connection handler started for {websocket.remote_address}")
    # Use the asynchronous redis client here
    aredis_client = aredis.Redis(host='redis', port=6379, db=0, decode_responses=True)

    try:
        connected_clients.add(websocket)
        await aredis_client.set(EXTENSION_STATUS_KEY, 'connected') # Removed ex parameter
        logging.info(f"EXTENSION_STATUS_KEY set to 'connected' for {websocket.remote_address}") # Added log
        logging.info(f"Client {websocket.remote_address} connected. Total clients: {len(connected_clients)}")

        async for message in websocket:
            logging.info(f"<- Received message from {websocket.remote_address}: {message}")
            try:
                data = json.loads(message)

                # If the message is the output from ChatGPT, reformat and broadcast it to all clients.
                if data.get('type') == 'CHATGPT_OUTPUT':
                    logging.info("Received CHATGPT_OUTPUT, re-broadcasting as SCRIPT_GENERATED.")
                    script_message = {
                        "type": "SCRIPT_GENERATED",
                        "payload": {
                            "script": data.get('payload')
                        }
                    }
                    # We are in the main asyncio loop, so we can await the broadcast directly.
                    await broadcast_to_clients(json.dumps(script_message))

                # Continue with the original logic of pushing all responses to Redis.
                await aredis_client.lpush(EXTENSION_RESPONSES_LIST, json.dumps(data))
            except json.JSONDecodeError:
                logging.warning(f"Received non-JSON message: {message}")

    except websockets.exceptions.ConnectionClosed as e:
        logging.info(f"Connection with {websocket.remote_address} closed: {e}")
    finally:
        connected_clients.remove(websocket)
        if not connected_clients:
            await aredis_client.set(EXTENSION_STATUS_KEY, 'disconnected')
            logging.info("Last client disconnected. Set extension status to 'disconnected' in Redis.")
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
    async with websockets.serve(register_client, "0.0.0.0", 8765):
        logging.info("WebSocket server started and listening on 0.0.0.0:8765")
        await asyncio.Future()  # Run forever

if __name__ == "__main__":
    logging.info("Starting WebSocket server application...")
    asyncio.run(main())
