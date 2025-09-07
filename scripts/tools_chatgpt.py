import asyncio
import json

# This function will be called by the Agent AI
# It needs a way to access the agent_command_queue from websocket_server.py
# For now, we'll define a placeholder function that the agent_app.py will provide.

_send_command_to_websocket_server_callback = None

def set_send_command_callback(callback):
    global _send_command_to_websocket_server_callback
    _send_command_to_websocket_server_callback = callback

async def send_message_to_chatgpt_tool(prompt: str) -> str:
    """
    Chrome Extension으로 전달할 메시지를 백엔드에 push.
    실제 구현은 웹소켓/HTTP를 통해 익스텐션에 전달.
    """
    if _send_command_to_websocket_server_callback is None:
        return "Error: WebSocket server communication not set up."

    command_data = {
        "type": "SEND_TO_CHATGPT",
        "payload": prompt
    }

    # Call the callback to send the command to the WebSocket server
    await _send_command_to_websocket_server_callback(command_data)

    return f"Command to send '{prompt}' to ChatGPT extension initiated. Waiting for response..."
