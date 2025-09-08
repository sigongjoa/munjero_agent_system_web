import asyncio
import json
import redis.asyncio as redis # Use asyncio version of redis
import uuid

# Initialize async Redis client
# decode_responses=True ensures Redis returns strings, not bytes
redis_client = redis.Redis(host='redis', port=6379, db=0, decode_responses=True)

# Redis Keys
AGENT_COMMANDS_LIST = 'agent_commands_list'
EXTENSION_RESPONSES_LIST = 'extension_responses_list'

async def _wait_for_response(request_id: str, timeout: int = 60) -> str:
    """
    Waits for a specific response from the Chrome Extension based on request_id
    by polling a Redis list.
    NOTE: This polling method is inefficient. A pub/sub model would be more robust.
    """
    start_time = asyncio.get_event_loop().time()
    while True:
        if asyncio.get_event_loop().time() - start_time > timeout:
            raise TimeoutError(f"Timeout waiting for response for request_id: {request_id}")

        # Get all responses from the list
        response_json_list = await redis_client.lrange(EXTENSION_RESPONSES_LIST, 0, -1)
        for res_json in response_json_list:
            try:
                response_data = json.loads(res_json)
                if response_data.get('request_id') == request_id:
                    # Found our response, remove it from the list and return
                    await redis_client.lrem(EXTENSION_RESPONSES_LIST, 1, res_json)
                    return response_data.get('payload', '')
            except json.JSONDecodeError:
                # Ignore malformed JSON in the list
                continue
        
        await asyncio.sleep(0.5) # Wait before polling again

async def send_message_to_chatgpt_tool(prompt: str, request_id: str) -> str:
    """
    Pushes a message to the command list for the websocket server to pick up,
    and waits for a response from the extension.
    """
    command_data = {
        "type": "SEND_TO_CHATGPT",
        "payload": {
            "prompt": prompt,
            "request_id": request_id
        }
    }

    # Push the command directly to the Redis list for the websocket server
    await redis_client.lpush(AGENT_COMMANDS_LIST, json.dumps(command_data))

    # Wait for the response from the extension
    try:
        chatgpt_response = await _wait_for_response(request_id)
        return chatgpt_response
    except TimeoutError as e:
        return str(e)

async def generate_shorts_script(topic: str) -> str:
    """
    Generates a shorts script based on a topic by sending a prompt to ChatGPT
    via the extension, and returns the generated script ID.
    """
    script_id = str(uuid.uuid4())
    prompt = f"""너는 숏폼 영상 전문가야. 다음 주제에 대해 1분짜리 쇼츠 영상 대본을 만들어줘. 
대본은 [도입], [전개], [결말] 구조를 가져야 하고, 각 문장은 시각적으로 상상하기 쉽게 구체적으로 묘사해줘.

주제: {topic}"""

    try:
        generated_script = await send_message_to_chatgpt_tool(prompt, script_id)
        if generated_script.startswith("Error:") or generated_script.startswith("Timeout"):
            return generated_script  # Return error message directly

        # Store the generated script in Redis
        await redis_client.set(f"script:{script_id}", generated_script)
        return script_id
    except Exception as e:
        return f"Error generating shorts script: {e}"

async def generate_images_for_script(script_id: str) -> str:
    """
    Generates image URLs for a given script ID and returns a JSON string of the URLs.
    (Currently simulates image generation).
    """
    script = await redis_client.get(f"script:{script_id}")
    if not script:
        return "Error: Script not found for the given ID."

    lines = [line.strip() for line in script.split('\n') if line.strip()]
    image_urls = []
    for i, line in enumerate(lines):
        # This is a placeholder for a real image generation API call (e.g., DALL-E)
        image_prompt = f"다음 텍스트를 사실적인 스타일의 이미지로 생성해줘: {line}"
        dummy_image_url = f"https://dummyimage.com/1024x1024/000/fff.png&text=Image+{i+1}"
        image_urls.append(dummy_image_url)

    # Store the generated image URLs in Redis
    image_urls_json = json.dumps(image_urls)
    await redis_client.set(f"images:{script_id}", image_urls_json)
    return image_urls_json
