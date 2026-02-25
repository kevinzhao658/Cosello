import base64
import io
import json
import os

import anthropic
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env


@app.post("/api/generate-listing")
async def generate_listing(images: list[UploadFile] = File(...)):
    if not images:
        raise HTTPException(status_code=400, detail="At least one image is required")

    # Build image content blocks for Claude (resize if over 4MB)
    MAX_BYTES = 4 * 1024 * 1024  # 4MB to stay safely under Claude's 5MB limit
    MAX_DIMENSION = 2048

    content = []
    for img in images:
        data = await img.read()

        # Resize large images
        if len(data) > MAX_BYTES:
            pil_img = Image.open(io.BytesIO(data))
            pil_img.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.LANCZOS)
            buf = io.BytesIO()
            pil_img.save(buf, format="JPEG", quality=85)
            data = buf.getvalue()
            media_type = "image/jpeg"
        else:
            media_type = img.content_type or "image/jpeg"

        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": base64.b64encode(data).decode("utf-8"),
            },
        })

    content.append({
        "type": "text",
        "text": (
            "You are a product listing assistant for a neighborhood marketplace. "
            "Analyze the product image(s) and generate a listing. "
            "Return ONLY valid JSON with these exact fields:\n"
            "{\n"
            '  "title": "short product title",\n'
            '  "description": "2-3 sentence description highlighting key features and condition",\n'
            '  "price": "estimated fair market price as a number string like 85.00",\n'
            '  "condition": "one of: New, Like New, Good, Fair, Poor",\n'
            '  "location": "suggest a Manhattan neighborhood",\n'
            '  "venues": ["Local", "Facebook"]\n'
            "}\n"
            "Be realistic with pricing. No markdown, no code fences, just the JSON object."
        ),
    })

    try:
        response = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=512,
            messages=[{"role": "user", "content": content}],
        )

        raw = response.content[0].text.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1]  # remove first line (```json)
            raw = raw.rsplit("```", 1)[0]  # remove closing ```
            raw = raw.strip()
        # Parse to validate it's real JSON, then return
        listing = json.loads(raw)
        return listing

    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned invalid JSON")
    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail=f"Claude API error: {e.message}")
