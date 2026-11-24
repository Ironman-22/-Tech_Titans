"""
FormMitra — Gemini Client
Handles all IMAGE tasks (POST /check-document) including seal/stamp detection,
blur, format, and readability inspection on Student ID, Income Certificate, and Marksheet.
Uses the official google-genai SDK with an 8-second timeout.
Groq is never called for images.
"""

import os
import re
import json
import asyncio
from pathlib import Path
from dotenv import load_dotenv
from google import genai
from google.genai import types

# Ensure .env is loaded
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)


class KeyNotConfiguredError(Exception):
    """Raised when the Gemini API key is missing or empty."""
    pass


class GeminiServiceError(Exception):
    """Raised when Gemini API encounters a network, timeout, or service error."""
    pass


def is_configured() -> bool:
    """Returns True if GEMINI_API_KEY is configured in the environment, False otherwise."""
    key = os.getenv("GEMINI_API_KEY", "").strip()
    return bool(key)


def get_model() -> str:
    """
    Returns the Gemini model name from environment.
    If 'gemini-3-flash' is configured, maps to the active Gemini 3 Flash tier
    ('gemini-3.5-flash-lite') to match Google GenAI API endpoint naming.
    """
    model = os.getenv("GEMINI_MODEL", "gemini-3-flash").strip()
    if model in ("gemini-3-flash", "models/gemini-3-flash"):
        return "gemini-3.5-flash-lite"
    return model


# System prompt strictly per requirements:
# inspect the uploaded document and return JSON only, listing issues such as blurry, wrong format, missing seal, or unreadable text.
SYSTEM_PROMPT = (
    "Inspect the uploaded document and return JSON only, listing issues such as blurry, wrong format, missing seal, or unreadable text."
)


async def check_document(image_bytes: bytes, mime: str = "image/jpeg", doc_type: str = "Student ID") -> dict:
    """
    Inspects an uploaded document using Gemini Vision.
    Signature: check_document(image_bytes, mime, doc_type) -> {ok, issues[]}
    Enforces an 8-second timeout.
    """
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise KeyNotConfiguredError("document check unavailable: key not configured")

    if not image_bytes or len(image_bytes) == 0:
        return {"ok": False, "issues": ["No image bytes provided."]}

    # Check file size (< 2MB)
    size_mb = len(image_bytes) / (1024 * 1024)
    if size_mb > 2.0:
        return {"ok": False, "issues": [f"File size ({size_mb:.2f}MB) exceeds 2MB limit. Please compress or resize."]}

    model_name = get_model()

    client = genai.Client(api_key=api_key)

    clean_mime = mime or "image/jpeg"
    if "png" in clean_mime.lower():
        clean_mime = "image/png"
    elif "webp" in clean_mime.lower():
        clean_mime = "image/webp"
    else:
        clean_mime = "image/jpeg"

    image_part = types.Part.from_bytes(data=image_bytes, mime_type=clean_mime)
    user_instruction = (
        f"The student uploaded this image claiming to be a '{doc_type}'. "
        "Inspect the uploaded document and return JSON only with keys: "
        "'ok' (boolean) and 'issues' (list of strings). "
        "List all issues detected, such as blurry image, wrong format, missing seal or official stamp, or unreadable text. "
        "If the document is clear, valid, and contains necessary seals/signatures, set ok=true and issues=[]."
    )

    config = types.GenerateContentConfig(
        temperature=0.1,
        system_instruction=SYSTEM_PROMPT,
        response_mime_type="application/json"
    )

    try:
        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=model_name,
                contents=[image_part, user_instruction],
                config=config
            ),
            timeout=8.0
        )

        raw_text = response.text or "{}"
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw_text.strip())

        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            # Try finding first { and last }
            start = cleaned.find("{")
            end = cleaned.rfind("}")
            if start != -1 and end != -1 and end > start:
                parsed = json.loads(cleaned[start:end + 1])
            else:
                return {"ok": False, "issues": ["Could not parse document verification response."]}

        if isinstance(parsed, list):
            issues = [str(item) if not isinstance(item, dict) else item.get("issue", str(item)) for item in parsed]
            ok = len(issues) == 0
        elif isinstance(parsed, dict):
            raw_issues = parsed.get("issues", [])
            if not isinstance(raw_issues, list):
                raw_issues = [str(raw_issues)] if raw_issues else []

            flat_issues = []
            for item in raw_issues:
                if isinstance(item, str) and item.strip().startswith("{"):
                    try:
                        sub = json.loads(item.replace("'", '"'))
                        if isinstance(sub, dict) and "issues" in sub:
                            flat_issues.extend(sub["issues"])
                            continue
                    except Exception:
                        pass
                flat_issues.append(str(item))

            issues = flat_issues
            ok = bool(parsed.get("ok", len(issues) == 0))
        else:
            issues = []
            ok = False

        return {
            "ok": ok,
            "issues": issues
        }

    except asyncio.TimeoutError:
        raise GeminiServiceError("Gemini request timed out after 8s.")
    except Exception as e:
        err_msg = str(e)
        if "timeout" in err_msg.lower():
            raise GeminiServiceError("Gemini request timed out after 8s.")
        raise GeminiServiceError(f"Gemini API error: {err_msg}")
