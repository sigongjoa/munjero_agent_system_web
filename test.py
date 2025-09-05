import asyncio
import websockets

async def test():
    try:
        async with websockets.connect("ws://127.0.0.1:8765") as ws:
            print("✅ Connected to server")
            await ws.send("hello from WSL2")
            response = await ws.recv()
            print(" Received:", response)
    except Exception as e:
        print("❌ Error:", e)

asyncio.run(test())