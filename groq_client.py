"""
FormMitra — Groq Client
Handles all TEXT tasks (POST /explain-field and field guidance Q&A) in English, Kannada, and Hindi.
Uses the official AsyncGroq SDK with an 8-second timeout.
Gemini is never called for text.
"""

import os
import asyncio
from pathlib import Path
from dotenv import load_dotenv
from groq import AsyncGroq

# Ensure .env is loaded
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)


class KeyNotConfiguredError(Exception):
    """Raised when the Groq API key is missing or empty."""
    pass


class GroqServiceError(Exception):
    """Raised when Groq API encounters a network, timeout, or service error."""
    pass


def is_configured() -> bool:
    """Returns True if GROQ_API_KEY is configured in the environment, False otherwise."""
    key = os.getenv("GROQ_API_KEY", "").strip()
    return bool(key)


def get_model() -> str:
    """Returns the Groq model name from environment."""
    model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").strip()
    if model in ("llama-3.3-70b-versatile", ""):
        return "openai/gpt-oss-120b"
    return model


def normalize_language_name(lang: str) -> str:
    """Normalizes language code to its full language name."""
    l = (lang or "en").lower()
    if "kn" in l or "kannada" in l:
        return "Kannada"
    if "hi" in l or "hindi" in l:
        return "Hindi"
    return "English"


# System prompt strictly per requirements:
# Answer only about scholarship forms (NSP/SSP/VTU), keep it short and simple,
# reply in the requested language, and say "I'm not sure, please check the official portal" instead of guessing.
SYSTEM_PROMPT = (
    "You are FormMitra, an AI scholarship assistant for Indian students applying on NSP, SSP, and VTU portals. "
    "Answer only about scholarship forms (NSP/SSP/VTU). Keep your answer short and simple (1 to 3 sentences). "
    "Reply strictly in the requested language using its native script (Kannada in Kannada script, Hindi in Devanagari script, English in English). "
    "If you are not certain, say: \"I'm not sure, please check the official portal\" instead of guessing."
)


async def explain_field(field_label: str, context: str = "", language: str = "en") -> str:
    """
    Explains a scholarship form field in the requested language using Groq.
    Signature: explain_field(field_label, context, language) -> str
    Enforces an 8-second timeout.
    """
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        raise KeyNotConfiguredError("field explanation unavailable: key not configured")

    model = get_model()
    lang_name = normalize_language_name(language)

    user_prompt = (
        f"Field Label: {field_label}\n"
        f"Page Context: {context or 'Scholarship Application Form'}\n"
        f"Requested Language: {lang_name}"
    )

    client = AsyncGroq(api_key=api_key, timeout=8.0)

    try:
        completion = await asyncio.wait_for(
            client.chat.completions.create(
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt}
                ],
                model=model,
                temperature=0.2,
                max_tokens=250
            ),
            timeout=8.0
        )

        content = completion.choices[0].message.content or ""
        explanation = content.strip()
        if not explanation:
            return "I'm not sure, please check the official portal."
        return explanation

    except asyncio.TimeoutError:
        raise GroqServiceError("Groq request timed out after 8s.")
    except Exception as e:
        err_msg = str(e)
        if "timeout" in err_msg.lower():
            raise GroqServiceError("Groq request timed out after 8s.")
        raise GroqServiceError(f"Groq API error: {err_msg}")
