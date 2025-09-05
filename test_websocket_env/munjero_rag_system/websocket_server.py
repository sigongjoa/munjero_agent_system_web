import asyncio
import websockets
import sys # Import sys for flush
import json # Import json

async def register_client(websocket):
    print(f"WS_Server: Client connected: {websocket.remote_address}", flush=True, file=sys.stderr)
    try:
        welcome_message_data = {
            "type": "welcome",
            "message": "Welcome to the simplified WebSocket server!"
        }
        await websocket.send(json.dumps(welcome_message_data))
        print(f"WS_Server: Sent welcome message '{welcome_message_data}' to {websocket.remote_address}", flush=True, file=sys.stderr)
        async for message in websocket:
            print(f"WS_Server: Received message from client {websocket.remote_address}: {message}", flush=True, file=sys.stderr)
            
            # Attempt to parse incoming message as JSON
            try:
                received_data = json.loads(message)
                echo_payload = received_data # Echo back the parsed data
            except json.JSONDecodeError:
                echo_payload = message # If not JSON, echo back as string

            response_message_data = {
                "type": "echo",
                "payload": echo_payload
            }
            await websocket.send(json.dumps(response_message_data))
            print(f"WS_Server: Sent echo response '{response_message_data}' to {websocket.remote_address}", flush=True, file=sys.stderr)
    except websockets.exceptions.ConnectionClosedOK:
        print(f"WS_Server: Client disconnected normally: {websocket.remote_address}", flush=True, file=sys.stderr)
    except websockets.exceptions.ConnectionClosed as e:
        print(f"WS_Server: Client connection closed unexpectedly for {websocket.remote_address}: {e}", flush=True, file=sys.stderr)
    except Exception as e:
        print(f"WS_Server: UNEXPECTED ERROR in client handler for {websocket.remote_address}: {e}", flush=True, file=sys.stderr)
    finally:
        print(f"WS_Server: Client handler finished for {websocket.remote_address}", flush=True, file=sys.stderr)

async def main():
    print(">>> WS_Server: Simplified websocket_server.py started <<<", flush=True, file=sys.stderr)
    try:
        print("WS_Server: Attempting to bind WebSocket server to 0.0.0.0:8765...", flush=True, file=sys.stderr)
        async with websockets.serve(register_client, "0.0.0.0", 8765):
            print("WS_Server: WebSocket server successfully bound and listening on ws://0.0.0.0:8765", flush=True, file=sys.stderr)
            await asyncio.Future()  # run forever
    except Exception as e:
        print(f"WS_Server: CRITICAL ERROR binding WebSocket server: {e}", flush=True, file=sys.stderr)
        sys.exit(1) # Exit if server cannot bind

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("WS_Server: Server stopped by KeyboardInterrupt.", flush=True, file=sys.stderr)
    except Exception as e:
        print(f"WS_Server: UNEXPECTED ERROR starting WebSocket server: {e}", flush=True, file=sys.stderr)
        sys.exit(1)