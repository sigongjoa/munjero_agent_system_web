import asyncio
import websockets
import json
import redis.asyncio as redis # Use asyncio version of redis
import datetime
import sys
import logging

# Configure detailed logging
logging.basicConfig(
    level=logging.DEBUG,
    stream=sys.stdout,
    format='[%(levelname)s] %(name)s: %(message)s'
)

# --- Global State ---
# Redis client will be initialized in main()
redis_client = None
connected_clients = set()
AGENT_COMMANDS_LIST = 'agent_commands_list'
EXTENSION_RESPONSES_LIST = 'extension_responses_list'
EXTENSION_STATUS_KEY = 'extension_connection_status'

# --- WebSocket Connection Handler ---
async def register_client(websocket):
    logging.info(f"Connection handler started for {websocket.remote_address}")
    connected_clients.add(websocket)
    await redis_client.set(EXTENSION_STATUS_KEY, 'connected', ex=15)
    logging.info(f"Client {websocket.remote_address} connected. Total clients: {len(connected_clients)}")

    try:
        async for message in websocket:
            logging.info(f"<- Received message from {websocket.remote_address}: {message}")
            try:
                data = json.loads(message)
                await redis_client.lpush(EXTENSION_RESPONSES_LIST, json.dumps(data))
                logging.debug(f"Pushed message from {websocket.remote_address} to Redis list '{EXTENSION_RESPONSES_LIST}'")
            except json.JSONDecodeError:
                logging.warning(f"Received non-JSON message from {websocket.remote_address}: {message}")
            except Exception as e:
                logging.error(f"Error processing message from {websocket.remote_address}: {e}", exc_info=True)

    except websockets.exceptions.ConnectionClosed as e:
        logging.info(f"Connection with {websocket.remote_address} closed cleanly: {e}")
    except Exception as e:
        logging.error(f"An error occurred with connection {websocket.remote_address}: {e}", exc_info=True)
    finally:
        connected_clients.remove(websocket)
        if not connected_clients:
            await redis_client.delete(EXTENSION_STATUS_KEY)
            logging.info("Last client disconnected. Cleared extension status from Redis.")
        logging.info(f"Client {websocket.remote_address} disconnected. Total clients: {len(connected_clients)}")
        logging.info(f"Connection handler finished for {websocket.remote_address}")

# --- Redis Queue Listener and Broadcaster ---
async def websocket_sender():
    logging.info(f"Starting websocket_sender task to listen on Redis list '{AGENT_COMMANDS_LIST}'...")
    while True:
        try:
            logging.debug("Waiting for command from Redis (blocking pop)...")
            # Use await for the async brpop
            _, command_json = await redis_client.brpop(AGENT_COMMANDS_LIST, timeout=0)
            logging.info(f"<- Popped command from Redis: {command_json}")

            if not connected_clients:
                logging.warning("No clients connected. Re-queuing command.")
                await redis_client.rpush(AGENT_COMMANDS_LIST, command_json)
                await asyncio.sleep(1)
                continue

            if connected_clients:
                logging.debug(f"Broadcasting command to {len(connected_clients)} client(s)...")
                await asyncio.gather(*[client.send(command_json) for client in connected_clients])
                logging.info(f"-> Sent command to {len(connected_clients)} client(s): {command_json}")

        except redis.exceptions.ConnectionError as e:
            logging.error(f"Redis connection error in websocket_sender: {e}. Retrying in 5s.", exc_info=True)
            await asyncio.sleep(5)
        except Exception as e:
            logging.error(f"An error occurred in websocket_sender: {e}", exc_info=True)
            await asyncio.sleep(1)

# --- Main Application ---
async def main():
    global redis_client
    logging.info("Starting main application coroutine...")
    
    # --- Redis Client Setup ---
    try:
        logging.info("Connecting to Redis on host 'redis'...")
        redis_client = redis.Redis(host='redis', port=6379, db=0, decode_responses=True)
        await redis_client.ping() # Use await
        logging.info("Redis connection successful.")
    except redis.exceptions.ConnectionError as e:
        logging.error(f"Could not connect to Redis: {e}", exc_info=True)
        sys.exit(1)

    sender_task = asyncio.create_task(websocket_sender())
    logging.info("websocket_sender task created.")

    async with websockets.serve(register_client, "0.0.0.0", 8765):
        logging.info("WebSocket server startup complete. Listening on 0.0.0.0:8765")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    logging.info("Starting WebSocket server application...")
    asyncio.run(main())
