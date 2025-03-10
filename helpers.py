from fastapi import HTTPException, Request
import json
import os
import uuid
import pdfplumber as pdf
import docx
import redis
import google.generativeai as genai
from google.ai.generativelanguage_v1beta.types import content
import time


# redis setup (local)
redis_client = redis.Redis(
    host='redis-13110.c264.ap-south-1-1.ec2.redns.redis-cloud.com',
    port=13110,
    decode_responses=True,
    username="default",
    password="wTzGEkFrYHtoSi2RTz3jy54yK297ywft",
)


# Google Gemini LLM setup
genai.configure(api_key=os.environ["GEMINI_API_KEY"])

generation_config = {
    "temperature": 1,
    "top_p": 0.95,
    "top_k": 40,
    "max_output_tokens": 8192,
    "response_schema": content.Schema(
        type=content.Type.OBJECT,
        properties={
            "JD-Match": content.Schema(type=content.Type.NUMBER),
            "Missing Skills": content.Schema(
                type=content.Type.ARRAY,
                items=content.Schema(type=content.Type.STRING),
            ),
            "Profile Summary": content.Schema(type=content.Type.STRING),
            "Position": content.Schema(type=content.Type.INTEGER),
        },
    ),
    "response_mime_type": "application/json",
}
model = genai.GenerativeModel(
    model_name="gemini-1.5-flash-8b", generation_config=generation_config)  # type: ignore


MAX_REQUESTS = int(os.environ.get("MAX_REQUESTS", "3"))  # Maximum number of requests allowed
MAX_REQUESTS_FREE = int(os.environ.get("MAX_REQUESTS_FREE", "7"))  # max number of requests for free users
RATE_LIMIT_WINDOW = 24 * 60 * 60  # 24 hours in seconds


# Helper functions


def extract_pdf_text(file):
    """Extracts text from a PDF file object."""
    temp_file_path = f"temp_{uuid.uuid4()}.pdf"
    try:
        # Save uploaded file to a temporary location
        with open(temp_file_path, "wb") as temp_file:
            contents = file.read()
            temp_file.write(contents)
            file.seek(0)  # Reset file pointer for potential reuse

        # Extract text from the saved file
        text = ""
        with pdf.open(temp_file_path) as pdf_file:
            for page in pdf_file.pages:
                text += page.extract_text() or ""
        return text
    finally:
        # Clean up temporary file
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)


def extract_docx_text(file):
    """Extracts text from a DOCX file object."""
    temp_file_path = f"temp_{uuid.uuid4()}.docx"
    try:
        # Save uploaded file to a temporary location
        with open(temp_file_path, "wb") as temp_file:
            contents = file.read()
            temp_file.write(contents)
            file.seek(0)  # Reset file pointer for potential reuse

        # Extract text from the saved file
        doc = docx.Document(temp_file_path)
        return "\n".join([para.text for para in doc.paragraphs])
    finally:
        # Clean up temporary file
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)


def get_llm_response(prompt):
    """Gets response from LLM."""
    response = model.generate_content(prompt)
    return response.text


def parse_llm_response(llm_response):
    """Parses LLM response into structured JSON."""
    try:
        response_json = json.loads(llm_response)
        return {
            "JD-Match": response_json.get("JD-Match", 0),
            "Missing Skills": response_json.get("Missing Skills", []),
            "Profile Summary": response_json.get("Profile Summary", ""),
        }
    except json.JSONDecodeError:
        # Handle case where LLM response is not valid JSON
        return {
            "JD-Match": 0,
            "Missing Skills": ["Error parsing LLM response"],
            "Profile Summary": "Could not generate profile summary due to parsing error.",
        }


def extract_text_from_file(file, file_type=None):
    """Extracts text from a file based on its extension."""
    if not file_type:
        file_type = file.filename.lower()

    if file_type.endswith(".pdf"):
        return extract_pdf_text(file.file)
    elif file_type.endswith(".docx"):
        return extract_docx_text(file.file)
    else:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Please upload PDF or DOCX files."
        )


def get_client_identifier(request: Request) -> str:
    """
    Get a unique identifier for the client.
    Uses IP address combined with User-Agent as a simple identifier.
    """
    ip = request.client.host  # type: ignore
    user_agent = request.headers.get("user-agent", "")
    return f"{ip}:{user_agent}"


def check_rate_limit_demo(request: Request):
    """
    Check if the client has exceeded their rate limit using Redis.
    Returns the number of remaining requests.
    Raises HTTPException if rate limit is exceeded.
    """
    client_id = get_client_identifier(request)
    current_time = int(time.time())
    key = f"rate_limit:{client_id}"

    # Get the list of timestamps for this client
    timestamps_data = redis_client.get(key)
    timestamps = json.loads(
        timestamps_data) if timestamps_data else []  # type: ignore

    # Filter out timestamps older than the rate limit window
    timestamps = [ts for ts in timestamps if current_time -
                  ts < RATE_LIMIT_WINDOW]

    # Check if client has reached the limit
    if len(timestamps) >= MAX_REQUESTS:
        oldest_timestamp = min(timestamps) if timestamps else current_time
        remaining_time = int(oldest_timestamp +
                             RATE_LIMIT_WINDOW - current_time)
        hours = remaining_time // 3600
        minutes = (remaining_time % 3600) // 60
        time_msg = f"{hours}h {minutes}m" if hours > 0 else f"{minutes}m"

        # Calculate retry-after in seconds
        retry_after = max(1, remaining_time)  # At least 1 second

        headers = {
            "Retry-After": str(retry_after),
            "X-Rate-Limit-Limit": str(MAX_REQUESTS),
            "X-Rate-Limit-Remaining": "0",
            "X-Rate-Limit-Reset": str(oldest_timestamp + RATE_LIMIT_WINDOW)
        }

        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Try again in {time_msg}.",
            headers=headers
        )

    # Add current timestamp to the list
    timestamps.append(current_time)

    # Store updated timestamps in Redis with TTL of RATE_LIMIT_WINDOW
    redis_client.setex(key, RATE_LIMIT_WINDOW, json.dumps(timestamps))

    # Return remaining requests
    return MAX_REQUESTS - len(timestamps)


def check_rate_limit_free_users(request: Request):
    """
    Check if the free client has exceeded their rate limit using Redis.
    Returns the number of remaining requests.
    Raises HTTPException if rate limit is exceeded.
    """
    client_id = get_client_identifier(request)
    current_time = int(time.time())
    key_free = f"rate_limit:{client_id}"

    # Get the list of timestamps for this client
    timestamps_data = redis_client.get(key_free)
    timestamps = json.loads(
        timestamps_data) if timestamps_data else []  # type: ignore

    # Filter out timestamps older than the rate limit window
    timestamps = [ts for ts in timestamps if current_time -
                  ts < RATE_LIMIT_WINDOW]

    # Check if client has reached the limit
    if len(timestamps) >= MAX_REQUESTS_FREE:
        oldest_timestamp = min(timestamps) if timestamps else current_time
        remaining_time = int(oldest_timestamp +
                             RATE_LIMIT_WINDOW - current_time)
        hours = remaining_time // 3600
        minutes = (remaining_time % 3600) // 60
        time_msg = f"{hours}h {minutes}m" if hours > 0 else f"{minutes}m"

        # Calculate retry-after in seconds
        retry_after = max(1, remaining_time)  # At least 1 second

        headers = {
            "Retry-After": str(retry_after),
            "X-Rate-Limit-Limit": str(MAX_REQUESTS_FREE),
            "X-Rate-Limit-Remaining": "0",
            "X-Rate-Limit-Reset": str(oldest_timestamp + RATE_LIMIT_WINDOW)
        }

        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Try again in {time_msg}.",
            headers=headers
        )

    # Add current timestamp to the list
    timestamps.append(current_time)

    # Store updated timestamps in Redis with TTL of RATE_LIMIT_WINDOW
    redis_client.setex(key_free, RATE_LIMIT_WINDOW, json.dumps(timestamps))

    # Return remaining requests
    return MAX_REQUESTS_FREE - len(timestamps)