import asyncio
import websockets

async def test_connection():
    uri = "ws://127.0.0.1:8080/ws" # Connect to Nginx proxy
    try:
        async with websockets.connect(uri) as websocket:
            print(f"Successfully connected to {uri} from WSL2 via Nginx proxy.")
            # Wait for a welcome message
            try:
                message = await asyncio.wait_for(websocket.recv(), timeout=5)
                print(f"Received message: {message}")
            except asyncio.TimeoutError:
                print("No welcome message received within 5 seconds.")
            except Exception as e:
                print(f"Error receiving message: {e}")

    except Exception as e:
        print(f"Failed to connect to {uri} from WSL2: {e}")

if __name__ == "__main__":
    asyncio.run(test_connection())