import asyncio
import websockets

async def test_connection():
    uri = "ws://localhost:8765"
    try:
        async with websockets.connect(uri) as websocket:
            print(f"Successfully connected to {uri} from inside Docker.")
            # Wait for a welcome message
            try:
                message = await asyncio.wait_for(websocket.recv(), timeout=5)
                print(f"Received message: {message}")
            except asyncio.TimeoutError:
                print("No welcome message received within 5 seconds.")
            except Exception as e:
                print(f"Error receiving message: {e}")

    except Exception as e:
        print(f"Failed to connect to {uri} from inside Docker: {e}")

if __name__ == "__main__":
    asyncio.run(test_connection())
