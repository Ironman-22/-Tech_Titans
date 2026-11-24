"""
FormMitra Provider Isolation & Error Handling Test Suite
Verifies:
1. Groq handles all TEXT tasks (/explain-field) in English, Kannada, Hindi.
2. Gemini handles all IMAGE tasks (/check-document).
3. If Groq key is removed, document check still works and /explain-field returns 503 error.
4. If Gemini key is removed, /explain-field still works and /check-document returns 503 error.
5. GET /health accurately reports provider availability without exposing keys.
6. 8s timeout handling returns clear error JSON with no cross-provider retry.
"""

import os
import io
import base64
import asyncio
from unittest.mock import AsyncMock, patch
import pytest
from PIL import Image, ImageDraw
from fastapi.testclient import TestClient

from main import app
import groq_client
import gemini_client

client = TestClient(app)


def create_test_image(text="STUDENT ID CARD", blurry=False):
    """Creates a synthetic document image."""
    img = Image.new("RGB", (300, 150), color=(255, 255, 255) if not blurry else (180, 180, 180))
    d = ImageDraw.Draw(img)
    if not blurry:
        d.rectangle([(10, 10), (290, 140)], outline=(0, 0, 0), width=2)
        d.text((20, 30), f"{text}\nName: Rahul Kumar\n[COLLEGE SEAL]", fill=(0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


# ── Health Endpoint Tests ──────────────────────────────────────────

def test_health_endpoint():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert "groq" in data
    assert "gemini" in data
    assert isinstance(data["groq"], bool)
    assert isinstance(data["gemini"], bool)
    # Ensure raw secret keys are NEVER exposed in health output
    assert "aq." not in str(data).lower()
    assert "gsk_" not in str(data).lower()


# ── Missing Key Error Handling Tests ──────────────────────────────

def test_explain_field_missing_groq_key(monkeypatch):
    """When GROQ_API_KEY is missing, explain-field returns 503 unavailable error."""
    monkeypatch.setenv("GROQ_API_KEY", "")
    res = client.post("/explain-field", json={
        "field_label": "Gross vs Net Income",
        "language": "en"
    })
    assert res.status_code == 503
    data = res.json()
    assert data == {"error": "field explanation unavailable: key not configured"}


def test_check_document_missing_gemini_key(monkeypatch):
    """When GEMINI_API_KEY is missing, check-document returns 503 unavailable error."""
    monkeypatch.setenv("GEMINI_API_KEY", "")
    res = client.post("/check-document", json={
        "image": "aGVsbG8=",  # base64 "hello"
        "doc_type": "Student ID"
    })
    assert res.status_code == 503
    data = res.json()
    assert data == {"error": "document check unavailable: key not configured"}


# ── Isolation Tests (One key missing does NOT break the other) ────

def test_gemini_works_when_groq_key_missing(monkeypatch):
    """Removing Groq key does not affect Gemini document check."""
    monkeypatch.setenv("GROQ_API_KEY", "")
    with patch("gemini_client.check_document", new_callable=AsyncMock) as mock_gemini:
        mock_gemini.return_value = {"ok": True, "issues": []}
        monkeypatch.setenv("GEMINI_API_KEY", "AQ.mock_valid_key")

        img_bytes = create_test_image("INCOME CERTIFICATE")
        b64 = base64.b64encode(img_bytes).decode("utf-8")

        res = client.post("/check-document", json={
            "image": b64,
            "doc_type": "Income Certificate"
        })
        assert res.status_code == 200
        data = res.json()
        assert data["ok"] is True
        assert data["issues"] == []
        assert "doc_type" in data


def test_groq_works_when_gemini_key_missing(monkeypatch):
    """Removing Gemini key does not affect Groq field explanation."""
    monkeypatch.setenv("GEMINI_API_KEY", "")
    with patch("groq_client.explain_field", new_callable=AsyncMock) as mock_explain:
        mock_explain.return_value = "Enter gross income before deductions."
        monkeypatch.setenv("GROQ_API_KEY", "gsk_test_key_12345")

        res = client.post("/explain-field", json={
            "field_label": "Gross vs Net Income",
            "language": "en"
        })
        assert res.status_code == 200
        data = res.json()
        assert data["explanation"] == "Enter gross income before deductions."
        assert data["field_label"] == "Gross vs Net Income"
        assert data["language"] == "en"


# ── Groq Text Tasks in All 3 Languages (EN, KN, HI) ────────────────

def test_groq_explain_field_english(monkeypatch):
    """Verify Groq handles English text prompts with correct system prompt and model."""
    monkeypatch.setenv("GROQ_API_KEY", "gsk_mock_valid_key")
    with patch("groq.resources.chat.completions.AsyncCompletions.create", new_callable=AsyncMock) as mock_create:
        mock_choice = AsyncMock()
        mock_choice.message.content = "Enter your gross annual family income as stated on your certificate."
        mock_resp = AsyncMock()
        mock_resp.choices = [mock_choice]
        mock_create.return_value = mock_resp

        res = asyncio.run(groq_client.explain_field("Gross vs Net Income", context="Portal Step 2", language="en"))
        assert "gross" in res.lower()
        mock_create.assert_called_once()
        call_kwargs = mock_create.call_args.kwargs
        assert call_kwargs["messages"][0]["role"] == "system"
        assert "scholarship" in call_kwargs["messages"][0]["content"].lower()
        assert "English" in call_kwargs["messages"][1]["content"]


def test_groq_explain_field_kannada(monkeypatch):
    """Verify Groq handles Kannada language requests."""
    monkeypatch.setenv("GROQ_API_KEY", "gsk_mock_valid_key")
    with patch("groq.resources.chat.completions.AsyncCompletions.create", new_callable=AsyncMock) as mock_create:
        mock_choice = AsyncMock()
        mock_choice.message.content = "ವಿದ್ಯಾರ್ಥಿವೇತನಕ್ಕಾಗಿ ನಿಮ್ಮ ಒಟ್ಟು ವಾರ್ಷಿಕ ಆದಾಯವನ್ನು ನಮೂದಿಸಿ."
        mock_resp = AsyncMock()
        mock_resp.choices = [mock_choice]
        mock_create.return_value = mock_resp

        res = asyncio.run(groq_client.explain_field("RD Number", context="Nadakacheri", language="kn"))
        assert len(res) > 5
        call_kwargs = mock_create.call_args.kwargs
        assert "Kannada" in call_kwargs["messages"][1]["content"]


def test_groq_explain_field_hindi(monkeypatch):
    """Verify Groq handles Hindi language requests."""
    monkeypatch.setenv("GROQ_API_KEY", "gsk_mock_valid_key")
    with patch("groq.resources.chat.completions.AsyncCompletions.create", new_callable=AsyncMock) as mock_create:
        mock_choice = AsyncMock()
        mock_choice.message.content = "छात्रवृत्ति के लिए सकल वार्षिक पारिवारिक आय दर्ज करें।"
        mock_resp = AsyncMock()
        mock_resp.choices = [mock_choice]
        mock_create.return_value = mock_resp

        res = asyncio.run(groq_client.explain_field("Gross Income", context="Portal Step 2", language="hi"))
        assert len(res) > 5
        call_kwargs = mock_create.call_args.kwargs
        assert "Hindi" in call_kwargs["messages"][1]["content"]


# ── Timeout Error Handling Tests (8s Timeout) ─────────────────────

def test_groq_timeout_handling(monkeypatch):
    """Groq client cuts off after 8s and raises GroqServiceError."""
    monkeypatch.setenv("GROQ_API_KEY", "gsk_mock_valid_key")
    with patch("asyncio.wait_for", side_effect=asyncio.TimeoutError):
        with pytest.raises(groq_client.GroqServiceError) as exc_info:
            asyncio.run(groq_client.explain_field("USN", language="en"))
        assert "timed out after 8s" in str(exc_info.value)


def test_gemini_timeout_handling(monkeypatch):
    """Gemini client cuts off after 8s and raises GeminiServiceError."""
    monkeypatch.setenv("GEMINI_API_KEY", "AQ.test_key")
    with patch("asyncio.wait_for", side_effect=asyncio.TimeoutError):
        with pytest.raises(gemini_client.GeminiServiceError) as exc_info:
            asyncio.run(gemini_client.check_document(b"fake-bytes", mime="image/jpeg", doc_type="Student ID"))
        assert "timed out after 8s" in str(exc_info.value)


# ── Gemini Vision Document Checks (Good vs Blurry) ───────────────

def test_gemini_check_document_good_file(monkeypatch):
    """Gemini returns ok=True when document is clear and seal is detected."""
    monkeypatch.setenv("GEMINI_API_KEY", "AQ.mock_valid_key")
    with patch("google.genai.models.AsyncModels.generate_content", new_callable=AsyncMock) as mock_gen:
        mock_resp = AsyncMock()
        mock_resp.text = '{"ok": true, "issues": []}'
        mock_gen.return_value = mock_resp

        result = asyncio.run(gemini_client.check_document(b"fake-clear-bytes", mime="image/jpeg", doc_type="Student ID"))
        assert result["ok"] is True
        assert result["issues"] == []


def test_gemini_check_document_blurry_file(monkeypatch):
    """Gemini returns ok=False and lists issues when document is blurry or missing seal."""
    monkeypatch.setenv("GEMINI_API_KEY", "AQ.mock_valid_key")
    with patch("google.genai.models.AsyncModels.generate_content", new_callable=AsyncMock) as mock_gen:
        mock_resp = AsyncMock()
        mock_resp.text = '{"ok": false, "issues": ["blurry image", "missing seal"]}'
        mock_gen.return_value = mock_resp

        result = asyncio.run(gemini_client.check_document(b"fake-blurry-bytes", mime="image/jpeg", doc_type="Income Certificate"))
        assert result["ok"] is False
        assert "blurry image" in result["issues"]
        assert "missing seal" in result["issues"]
