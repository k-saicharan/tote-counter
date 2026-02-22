import base64
import json
import os
from groq import Groq
from server.prompt import TOTE_COUNTING_PROMPT


def get_client():
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY not set. Add it to your .env file.")
    return Groq(api_key=api_key)


def count_totes(base64_image: str) -> dict:
    """Send an image to Groq and get the tote count back."""
    client = get_client()

    model = os.getenv("GROQ_MODEL", "meta-llama/llama-4-maverick-17b-128e-instruct")

    response = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{base64_image}",
                        },
                    },
                    {
                        "type": "text",
                        "text": TOTE_COUNTING_PROMPT,
                    },
                ],
            }
        ],
    )

    raw = response.choices[0].message.content.strip()

    # Extract the last JSON object from the response (chain-of-thought before it)
    result = None
    # Try finding JSON on the last line first
    for line in reversed(raw.split("\n")):
        line = line.strip()
        # Strip markdown code fences
        if line.startswith("```"):
            continue
        if line.startswith("{"):
            try:
                result = json.loads(line)
                break
            except json.JSONDecodeError:
                continue

    if result is None:
        return {"count": -1, "confidence": "low", "error": f"Failed to parse: {raw}"}

    count = result.get("count", -1)
    if isinstance(count, int) and count > 60:
        result["count"] = 60
        result["warning"] = "Count exceeded max 60, capped."

    return result
