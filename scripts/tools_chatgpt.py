import asyncio
import json
import redis.asyncio as redis
import uuid
import sys
import logging

# Configure logging for tools_chatgpt
logging.basicConfig(
    level=logging.INFO,
    stream=sys.stdout,
    format='[%(levelname)s] TOOLS: %(message)s'
)

# Initialize async Redis client
redis_client = redis.Redis(host='redis', port=6379, db=0, decode_responses=True)

# Redis Keys
AGENT_COMMANDS_LIST = 'agent_commands_list'
EXTENSION_RESPONSES_LIST = 'extension_responses_list'
EXTENSION_STATUS_KEY = 'extension_connection_status' # Key to check extension status

async def _wait_for_response(request_id: str, timeout: int = 60) -> str:
    """
    Waits for a specific response from the Chrome Extension based on request_id.
    """
    logging.info(f"TOOLS: _wait_for_response called for request_id: {request_id}")
    start_time = asyncio.get_event_loop().time()
    while True:
        if asyncio.get_event_loop().time() - start_time > timeout:
            logging.warning(f"TOOLS: Timeout waiting for response for request_id: {request_id}")
            raise TimeoutError(f"Timeout waiting for response for request_id: {request_id}")

        response_json_list = await redis_client.lrange(EXTENSION_RESPONSES_LIST, 0, -1)
        logging.debug(f"TOOLS: Polling Redis. Found {len(response_json_list)} items in {EXTENSION_RESPONSES_LIST}")

        for res_json in response_json_list:
            try:
                response_data = json.loads(res_json)
                logging.debug(f"TOOLS: Checking item: {response_data.get('request_id')} vs target {request_id}")
                if response_data.get('request_id') == request_id:
                    logging.info(f"TOOLS: Found matching response for request_id: {request_id}")
                    await redis_client.lrem(EXTENSION_RESPONSES_LIST, 1, res_json) # Remove the processed response
                    return response_data.get('payload', '')
            except json.JSONDecodeError:
                logging.warning(f"TOOLS: Malformed JSON in Redis list: {res_json}")
                continue
        await asyncio.sleep(0.5) # Wait a bit before checking again

async def send_message_to_chatgpt_tool(prompt: str, request_id: str) -> str:
    """
    Pushes a message to the command list for the websocket server to pick up,
    and waits for a response from the extension.
    """
    logging.info(f"TOOLS: send_message_to_chatgpt_tool called for request_id: {request_id}")
    
    # --- Wait for Extension to be Ready ---
    logging.info(f"TOOLS: Waiting for extension to be ready for request_id: {request_id}")
    ready_timeout = 30 # seconds
    start_ready_time = asyncio.get_event_loop().time()
    while True:
        status = await redis_client.get(EXTENSION_STATUS_KEY)
        if status == 'connected':
            logging.info(f"TOOLS: Extension is connected for request_id: {request_id}")
            break
        if asyncio.get_event_loop().time() - start_ready_time > ready_timeout:
            logging.error(f"TOOLS: Extension not connected within timeout for request_id: {request_id}")
            return "Error: Extension not connected within timeout."
        await asyncio.sleep(1) # Check every second

    command_data = {
        "type": "SEND_TO_CHATGPT",
        "payload": {
            "prompt": prompt,
            "request_id": request_id
        }
    }

    await redis_client.lpush(AGENT_COMMANDS_LIST, json.dumps(command_data))
    logging.info(f"TOOLS: Command pushed to {AGENT_COMMANDS_LIST} for request_id: {request_id}")

    try:
        chatgpt_response = await _wait_for_response(request_id)
        return chatgpt_response
    except TimeoutError as e:
        logging.error(f"TOOLS: Timeout in send_message_to_chatgpt_tool for request_id: {request_id}")
        return str(e)

async def generate_shorts_script(topic: str, script_id: str = None) -> str:
    """
    Generates a shorts script based on a topic by sending a prompt to ChatGPT
    via the extension, and returns the generated script ID.
    """
    if script_id is None:
        script_id = str(uuid.uuid4())
    logging.info(f"TOOLS: generate_shorts_script called for topic: {topic}, script_id: {script_id}")
    prompt = f"""너는 숏폼 영상 전문가다. 다음 주제에 대해 질문하지 말고, 즉시 1분짜리 쇼츠 영상 대본을 생성해라. 
대본은 반드시 [도입], [전개], [결말] 구조를 가져야 한다. 각 문장은 시각적으로 상상하기 쉽게 구체적으로 묘사해야 한다.

주제: {topic}"""

    try:
        generated_script = await send_message_to_chatgpt_tool(prompt, script_id)
        if generated_script.startswith("Error:") or generated_script.startswith("Timeout"):
            logging.error(f"TOOLS: Error or Timeout generating script for {script_id}: {generated_script}")
            return generated_script  # Return error message directly

        await redis_client.set(f"script:{script_id}", generated_script)
        logging.info(f"TOOLS: Script {script_id} saved to Redis.")
        return script_id
    except Exception as e:
        logging.error(f"TOOLS: An unexpected error occurred in generate_shorts_script: {e}", exc_info=True)
        return f"Error generating shorts script: {e}"

async def generate_images_for_script(script_id: str) -> str:
    """
    Generates image URLs for a given script ID by sending prompts to ChatGPT.
    """
    logging.info(f"TOOLS: generate_images_for_script called for script_id: {script_id}")
    script = await redis_client.get(f"script:{script_id}")
    if not script:
        logging.error(f"TOOLS: Script not found for image generation: {script_id}")
        return json.dumps({"error": "Script not found for the given ID."})

    # Extract meaningful lines from the script to use as prompts
    lines = [line.strip() for line in script.split('\n') if line.strip() and not line.strip().startswith(('[', '(', '️'))]
    image_urls = []

    logging.info(f"TOOLS: Generating {len(lines)} images for script {script_id}")
    for i, line in enumerate(lines):
        # Each image generation needs a unique request_id
        image_request_id = f"{script_id}_image_{i+1}"
        image_prompt = f"다음 장면 묘사를 기반으로, 질문은 절대 하지 말고, 사실적인 스타일의 이미지를 즉시 생성해줘. 장면: '{line}'"
        
        logging.info(f"TOOLS: Sending image prompt to ChatGPT (request_id: {image_request_id}): {image_prompt}")
        try:
            # This will ask ChatGPT to generate an image and expect a URL in return.
            # The user's extension must be able to handle image generation prompts.
            generated_image_url = await send_message_to_chatgpt_tool(image_prompt, image_request_id)
            
            if generated_image_url and (generated_image_url.startswith('http') or generated_image_url.startswith('data:image')):
                image_urls.append(generated_image_url)
                logging.info(f"TOOLS: Successfully received image URL for request_id {image_request_id}")
            else:
                logging.warning(f"TOOLS: Received invalid or empty URL for request_id {image_request_id}: {generated_image_url}")
                # Optionally, add a placeholder if generation fails
                image_urls.append(f"https://dummyimage.com/1024x1024/ff0000/fff.png&text=Failed+to+generate+image+{i+1}")

        except TimeoutError:
            logging.error(f"TOOLS: Timeout waiting for image URL for request_id {image_request_id}")
            image_urls.append(f"https://dummyimage.com/1024x1024/ff0000/fff.png&text=Timeout+generating+image+{i+1}")
        except Exception as e:
            logging.error(f"TOOLS: Error generating image for request_id {image_request_id}: {e}")
            image_urls.append(f"https://dummyimage.com/1024x1024/ff0000/fff.png&text=Error+generating+image+{i+1}")

        # Add a significant delay to allow the UI to settle and image to fully render.
        logging.info(f"TOOLS: Waiting for 60 seconds before next image prompt...")
        await asyncio.sleep(60)

    image_urls_json = json.dumps(image_urls)
    await redis_client.set(f"images:{script_id}", image_urls_json)
    logging.info(f"TOOLS: Images for script {script_id} saved to Redis.")
    return image_urls_json
