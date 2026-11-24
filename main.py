"""
FormMitra — AI Scholarship Assistant Backend
FastAPI server with strict separation of concerns:
  - GROQ handles all TEXT tasks: POST /explain-field (English, Kannada, Hindi)
  - GEMINI handles all IMAGE tasks: POST /check-document (document verification, seals, clarity)
  - No overlap, no fallback, no shared code path.
"""

import os
import io
import sys
import base64
from typing import Optional, List
from pathlib import Path

# Add backend directory to sys.path so modules can be imported from any working directory
backend_dir = str(Path(__file__).resolve().parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# Load environment variables from backend/.env
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

# Import client modules
import groq_client
import gemini_client

app = FastAPI(
    title="FormMitra Backend",
    description="Backend for FormMitra scholarship assistant: Groq for Text, Gemini for Vision",
    version="2.0.0"
)

# Enable CORS for Chrome Extension origins, Vite portal, and local hosts
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic Request & Response Models ────────────────────────────

class ExplainFieldRequest(BaseModel):
    field_label: str
    context: Optional[str] = ""
    language: Optional[str] = "en"  # "en", "hi", "kn"


class ExplainFieldResponse(BaseModel):
    explanation: str
    field_label: str
    language: str


class DocumentCheckRequest(BaseModel):
    image: str  # Base64 string (with or without data:image/...;base64, prefix)
    doc_type: str = "Student ID"  # "Student ID", "Income Certificate", "Marksheet"
    filename: Optional[str] = "document.jpg"


class DocumentCheckResponse(BaseModel):
    ok: bool
    issues: List[str]
    details: str
    doc_type: str


# ── GET /health ───────────────────────────────────────────────────

@app.get("/health")
def health_check():
    """
    Returns configuration status of providers: {"groq": true/false, "gemini": true/false}.
    Never exposes API keys.
    """
    return {
        "groq": groq_client.is_configured(),
        "gemini": gemini_client.is_configured()
    }


@app.get("/")
def read_root():
    return {
        "service": "FormMitra Backend",
        "status": "online",
        "providers": {
            "text": "groq",
            "vision": "gemini"
        },
        "health": {
            "groq": groq_client.is_configured(),
            "gemini": gemini_client.is_configured()
        }
    }


# ── POST /explain-field (GROQ ONLY) ───────────────────────────────

@app.post("/explain-field")
async def explain_field_endpoint(req: ExplainFieldRequest):
    """
    Handles all field explanations and text guidance.
    Owned strictly by GROQ. Gemini is never called for text.
    """
    print(f"[FormMitra:Backend] POST /explain-field for '{req.field_label}' in language: '{req.language}'")

    try:
        explanation = await groq_client.explain_field(
            field_label=req.field_label,
            context=req.context or "",
            language=req.language or "en"
        )
        return {
            "explanation": explanation,
            "field_label": req.field_label,
            "language": req.language or "en"
        }

    except groq_client.KeyNotConfiguredError:
        print("[FormMitra:Backend] Groq API key is not configured.")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"error": "field explanation unavailable: key not configured"}
        )

    except groq_client.GroqServiceError as e:
        print(f"[FormMitra:Backend] Groq service error: {e}")
        status_code = status.HTTP_504_GATEWAY_TIMEOUT if "timed out" in str(e).lower() else status.HTTP_500_INTERNAL_SERVER_ERROR
        return JSONResponse(
            status_code=status_code,
            content={"error": str(e)}
        )

    except Exception as e:
        print(f"[FormMitra:Backend] Unexpected error in /explain-field: {e}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": f"Internal error: {str(e)}"}
        )


# ── POST /check-document (GEMINI ONLY) ────────────────────────────

@app.post("/check-document")
async def check_document_endpoint(req: DocumentCheckRequest):
    """
    Handles document quality, blur, format, and official seal/stamp inspection.
    Owned strictly by GEMINI. Groq is never called for images.
    """
    print(f"[FormMitra:Backend] POST /check-document for doc_type: '{req.doc_type}', filename: '{req.filename}'")

    # 1. Decode Base64 image
    raw_b64 = req.image
    mime_type = "image/jpeg"
    if "," in raw_b64:
        header, raw_b64 = raw_b64.split(",", 1)
        if "png" in header.lower():
            mime_type = "image/png"
        elif "webp" in header.lower():
            mime_type = "image/webp"

    try:
        image_bytes = base64.b64decode(raw_b64)
    except Exception:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "Invalid base64 image data."}
        )

    # 2. Call Gemini client directly
    try:
        result = await gemini_client.check_document(
            image_bytes=image_bytes,
            mime=mime_type,
            doc_type=req.doc_type
        )

        ok = result.get("ok", False)
        issues = result.get("issues", [])
        details = "Document verification passed. Clear image and valid credentials detected." if ok else (
            f"Issues found: {'; '.join(issues)}"
        )

        return {
            "ok": ok,
            "issues": issues,
            "details": details,
            "doc_type": req.doc_type
        }

    except gemini_client.KeyNotConfiguredError:
        print("[FormMitra:Backend] Gemini API key is not configured.")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"error": "document check unavailable: key not configured"}
        )

    except gemini_client.GeminiServiceError as e:
        print(f"[FormMitra:Backend] Gemini service error: {e}")
        status_code = status.HTTP_504_GATEWAY_TIMEOUT if "timed out" in str(e).lower() else status.HTTP_500_INTERNAL_SERVER_ERROR
        return JSONResponse(
            status_code=status_code,
            content={"error": str(e)}
        )

    except Exception as e:
        print(f"[FormMitra:Backend] Unexpected error in /check-document: {e}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": f"Internal error: {str(e)}"}
        )


# ── POST /check-document/upload (Multipart File Upload) ────────────

@app.post("/check-document/upload")
async def check_document_upload(
    doc_type: str = Form("Student ID"),
    file: UploadFile = File(...)
):
    """
    Multipart file upload endpoint. Reads file and calls Gemini client directly.
    """
    contents = await file.read()
    mime = file.content_type or "image/jpeg"

    try:
        result = await gemini_client.check_document(
            image_bytes=contents,
            mime=mime,
            doc_type=doc_type
        )

        ok = result.get("ok", False)
        issues = result.get("issues", [])
        details = "Document verification passed." if ok else f"Issues found: {'; '.join(issues)}"

        return {
            "ok": ok,
            "issues": issues,
            "details": details,
            "doc_type": doc_type
        }

    except gemini_client.KeyNotConfiguredError:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"error": "document check unavailable: key not configured"}
        )

    except gemini_client.GeminiServiceError as e:
        status_code = status.HTTP_504_GATEWAY_TIMEOUT if "timed out" in str(e).lower() else status.HTTP_500_INTERNAL_SERVER_ERROR
        return JSONResponse(
            status_code=status_code,
            content={"error": str(e)}
        )

    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": f"Internal error: {str(e)}"}
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
