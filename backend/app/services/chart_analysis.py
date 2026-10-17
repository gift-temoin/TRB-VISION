"""Chart screenshot analysis for the "Chart Analyzer" feature.

Two modes, chosen automatically at runtime:

1. Vision model mode (preferred) — when ``VISION_PROVIDER`` and ``VISION_API_KEY``
   are configured on the server, the screenshot is sent to a vision-capable model
   for a genuine directional read.
2. Heuristic preview mode (fallback) — when no vision provider is configured, a
   transparent image heuristic measures the balance of green (up) versus red
   (down) price action drawn on the chart. This is clearly labelled as an
   automated preview, never presented as a validated model or a probability.

Neither mode places trades or guarantees outcomes; output is informational only.
"""
from __future__ import annotations

import base64
import io
import json
import re
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import httpx
from PIL import Image

from ..config import settings
from ..schemas import ChartAnalysisOut

HEURISTIC_MODEL_NAME = "TRB Chart Vision — colour-balance preview (heuristic)"
VISION_MODEL_NAME = "Vision model"
DISCLAIMER = (
    "Automated chart reading for education only. It is not financial advice, not a "
    "guaranteed outcome, and does not place trades. Always verify with your own analysis."
)

MAX_BYTES = 6 * 1024 * 1024
ALLOWED_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}


def _tone_for(direction: str) -> str:
    return {"BULLISH": "bull", "BEARISH": "bear", "NEUTRAL": "neutral"}.get(
        direction, "neutral"
    )


def _label_for(direction: str) -> str:
    return {"BULLISH": "Upward bias", "BEARISH": "Downward bias", "NEUTRAL": "Sideways"}.get(
        direction, "Sideways"
    )


def _heuristic(image_bytes: bytes) -> ChartAnalysisOut:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    if img.width > 360:
        ratio = 360 / img.width
        img = img.resize((360, max(1, int(img.height * ratio))))

    pixels = list(img.getdata())
    total = len(pixels)
    green = red = 0
    for r, g, b in pixels:
        if g > r + 22 and g > b + 22 and g > 60:
            green += 1
        elif r > g + 22 and r > b + 22 and r > 60:
            red += 1

    colored = green + red
    coverage = colored / total if total else 0.0

    if coverage < 0.01 or colored == 0:
        return ChartAnalysisOut(
            direction="NEUTRAL",
            label=_label_for("NEUTRAL"),
            tone="neutral",
            confidence=None,
            confidence_label="Not a probability",
            source="Heuristic preview (colour balance)",
            is_real=False,
            model_name=HEURISTIC_MODEL_NAME,
            explanation=(
                "I could not find enough green/red price action in this screenshot to read a "
                "direction. Try a chart with coloured candles (green and red) and a clear "
                "price area."
            ),
            evidence=[
                "Detected almost no coloured (green/red) price action",
                f"Colour coverage was {coverage * 100:.1f}% of the image",
            ],
            disclaimer=DISCLAIMER,
        )

    share = green / colored
    if share > 0.58:
        direction = "BULLISH"
    elif share < 0.42:
        direction = "BEARISH"
    else:
        direction = "NEUTRAL"

    explanation = {
        "BULLISH": "Green (upward) price action is dominant in the screenshot, suggesting an "
        "upward directional bias.",
        "BEARISH": "Red (downward) price action is dominant in the screenshot, suggesting a "
        "downward directional bias.",
        "NEUTRAL": "Green and red price action are close to balanced, suggesting a sideways or "
        "indecisive bias.",
    }[direction]

    return ChartAnalysisOut(
        direction=direction,
        label=_label_for(direction),
        tone=_tone_for(direction),
        confidence=None,
        confidence_label="Not a probability",
        source="Heuristic preview (colour balance)",
        is_real=False,
        model_name=HEURISTIC_MODEL_NAME,
        explanation=explanation,
        evidence=[
            f"Green price action: {share * 100:.0f}% of coloured candles/bars",
            f"Red price action: {(1 - share) * 100:.0f}% of coloured candles/bars",
            f"Colour coverage: {coverage * 100:.1f}% of the image",
        ],
        disclaimer=DISCLAIMER,
    )


def _extract_json(text: str) -> Optional[dict]:
    text = text.strip()
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def _vision(image_bytes: bytes, content_type: str) -> Optional[ChartAnalysisOut]:
    b64 = base64.b64encode(image_bytes).decode("ascii")
    data_uri = f"data:{content_type or 'image/png'};base64,{b64}"
    prompt = (
        "You are a technical-analysis chart reader. Look at this trading chart screenshot "
        "and decide the most likely short-term directional bias. Reply with ONLY a JSON "
        'object: {"direction": "BULLISH"|"BEARISH"|"NEUTRAL", "confidence": 0-1, '
        '"explanation": "one or two sentences", "evidence": ["point", "point"]}. '
        "Do not give trading instructions or guarantees."
    )
    payload = {
        "model": settings.vision_model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": data_uri}},
                ],
            }
        ],
        "max_tokens": 400,
        "temperature": 0.2,
    }
    headers = {
        "Authorization": f"Bearer {settings.vision_api_key}",
        "Content-Type": "application/json",
    }
    try:
        with httpx.Client(timeout=45) as client:
            resp = client.post(
                f"{settings.vision_base_url.rstrip('/')}/chat/completions",
                headers=headers,
                json=payload,
            )
        if resp.status_code >= 400:
            return None
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        parsed = _extract_json(content or "")
        if not parsed:
            return None
        raw_dir = str(parsed.get("direction", "")).upper()
        direction = raw_dir if raw_dir in ("BULLISH", "BEARISH", "NEUTRAL") else "NEUTRAL"
        confidence = parsed.get("confidence")
        try:
            confidence = max(0.0, min(1.0, float(confidence))) if confidence is not None else None
        except (TypeError, ValueError):
            confidence = None
        evidence = parsed.get("evidence") or []
        if not isinstance(evidence, list):
            evidence = [str(evidence)]
        evidence: List[str] = [str(e) for e in evidence][:6]
        return ChartAnalysisOut(
            direction=direction,
            label=_label_for(direction),
            tone=_tone_for(direction),
            confidence=confidence,
            confidence_label="Model estimate (not a guarantee)" if confidence is not None else None,
            source=f"Vision model ({settings.vision_model})",
            is_real=True,
            model_name=VISION_MODEL_NAME,
            explanation=str(parsed.get("explanation") or "Model directional read of the chart."),
            evidence=evidence,
            disclaimer=DISCLAIMER,
        )
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError):
        return None


# --------------------------------------------------------------------------- #
# Rich structured read (ChartMind) — real vision model only
# --------------------------------------------------------------------------- #
@dataclass
class VisionRead:
    direction: str = "NEUTRAL"
    confidence: Optional[float] = None
    instrument: Optional[str] = None
    timeframe: Optional[str] = None
    trend: Optional[str] = None
    structure: Optional[str] = None
    current_price: Optional[float] = None
    price_axis_low: Optional[float] = None
    price_axis_high: Optional[float] = None
    entry: Optional[float] = None
    stop: Optional[float] = None
    target: Optional[float] = None
    levels: List[dict] = field(default_factory=list)
    patterns: List[str] = field(default_factory=list)
    reasoning_steps: List[str] = field(default_factory=list)
    challenges: List[str] = field(default_factory=list)
    summary: str = ""
    evidence: List[str] = field(default_factory=list)
    model_name: str = VISION_MODEL_NAME
    source: str = ""


READ_PROMPT = (
    "You are a meticulous technical-analysis chart reader. Study the uploaded trading chart "
    "screenshot and report ONLY what you can actually see. Reply with a single JSON object "
    "(no prose, no markdown fences) using exactly these keys:\n"
    "{\n"
    '  "instrument": "market shown, e.g. EURUSD / XAUUSD / BTCUSD / NAS100, or null",\n'
    '  "timeframe": "e.g. 1H / 4H / D1, or null",\n'
    '  "trend": "UP|DOWN|RANGE",\n'
    '  "structure": "one sentence on market structure (swing highs/lows, channels, ranges)",\n'
    '  "current_price": number or null,\n'
    '  "price_axis_low": number or null (lowest price label readable on the axis),\n'
    '  "price_axis_high": number or null (highest price label readable on the axis),\n'
    '  "direction": "BULLISH|BEARISH|NEUTRAL",\n'
    '  "confidence": number between 0 and 1,\n'
    '  "entry": number or null,\n'
    '  "stop": number or null,\n'
    '  "target": number or null,\n'
    '  "levels": [{"kind": "support|resistance", "price": number, "note": "why"}],\n'
    '  "patterns": ["named patterns you can see, e.g. ascending channel, double top"],\n'
    '  "reasoning_steps": ["each concrete step you took, in order and specific, '
    'e.g. \\"Read the y-axis: top label 1.1000, bottom label 1.0700\\""],\n'
    '  "challenges": ["difficulties or uncertainties you faced reading this image"],\n'
    '  "summary": "two or three sentence conclusion"\n'
    "}\n"
    "Rules: only report prices you can actually read from the chart's axis or labels; use null "
    "when unsure; never invent data; list at least 4 reasoning_steps. If the image is not a "
    "chart, explain that in summary and set direction to NEUTRAL, trend to RANGE, and all "
    "prices to null."
)


def _num(value) -> Optional[float]:
    if value is None or isinstance(value, bool):
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f


def _str_list(value, limit: int) -> List[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        value = [value]
    out: List[str] = []
    for item in value:
        text = str(item).strip()
        if text:
            out.append(text)
    return out[:limit]


def _vision_read(image_bytes: bytes, content_type: str) -> Optional[VisionRead]:
    b64 = base64.b64encode(image_bytes).decode("ascii")
    data_uri = f"data:{content_type or 'image/png'};base64,{b64}"
    payload = {
        "model": settings.vision_model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": READ_PROMPT},
                    {"type": "image_url", "image_url": {"url": data_uri}},
                ],
            }
        ],
        "max_tokens": 1200,
        "temperature": 0.1,
    }
    headers = {
        "Authorization": f"Bearer {settings.vision_api_key}",
        "Content-Type": "application/json",
    }
    try:
        with httpx.Client(timeout=60) as client:
            resp = client.post(
                f"{settings.vision_base_url.rstrip('/')}/chat/completions",
                headers=headers,
                json=payload,
            )
        if resp.status_code >= 400:
            return None
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        parsed = _extract_json(content or "")
        if not parsed:
            return None
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError):
        return None
    return _parse_read(parsed)


def _parse_read(parsed: dict) -> VisionRead:
    raw_dir = str(parsed.get("direction", "")).upper()
    direction = raw_dir if raw_dir in ("BULLISH", "BEARISH", "NEUTRAL") else "NEUTRAL"
    raw_trend = str(parsed.get("trend", "")).upper()
    trend = raw_trend if raw_trend in ("UP", "DOWN", "RANGE") else None

    levels: List[dict] = []
    for item in parsed.get("levels") or []:
        if not isinstance(item, dict):
            continue
        price = _num(item.get("price"))
        if price is None:
            continue
        kind = str(item.get("kind", "")).lower()
        if kind not in ("support", "resistance"):
            current = _num(parsed.get("current_price"))
            kind = "support" if current is not None and price < current else "resistance"
        levels.append({"kind": kind, "price": price, "note": str(item.get("note") or "").strip()})
    levels = levels[:10]

    instrument = parsed.get("instrument")
    instrument = str(instrument).strip() if instrument not in (None, "") else None
    timeframe = parsed.get("timeframe")
    timeframe = str(timeframe).strip() if timeframe not in (None, "") else None

    return VisionRead(
        direction=direction,
        confidence=_num(parsed.get("confidence")),
        instrument=instrument,
        timeframe=timeframe,
        trend=trend,
        structure=(str(parsed.get("structure")).strip() or None) if parsed.get("structure") else None,
        current_price=_num(parsed.get("current_price")),
        price_axis_low=_num(parsed.get("price_axis_low")),
        price_axis_high=_num(parsed.get("price_axis_high")),
        entry=_num(parsed.get("entry")),
        stop=_num(parsed.get("stop")),
        target=_num(parsed.get("target")),
        levels=levels,
        patterns=_str_list(parsed.get("patterns"), 8),
        reasoning_steps=_str_list(parsed.get("reasoning_steps"), 14),
        challenges=_str_list(parsed.get("challenges"), 8),
        summary=str(parsed.get("summary") or "").strip(),
        evidence=_str_list(parsed.get("reasoning_steps") or parsed.get("evidence"), 6),
        model_name=VISION_MODEL_NAME,
        source=f"Vision model ({settings.vision_model})",
    )


def read_chart(image_bytes: bytes, content_type: str) -> Tuple[Optional[VisionRead], List[str]]:
    """Return (rich vision read, warnings). ``None`` when no vision model is available."""
    warnings: List[str] = []
    if not settings.vision_configured:
        warnings.append(
            "No vision model is configured on the server, so the screenshot could not be read "
            "for real. Set VISION_PROVIDER and VISION_API_KEY to enable screenshot analysis."
        )
        return None, warnings
    read = _vision_read(image_bytes, content_type)
    if read is None:
        warnings.append(
            "The configured vision model was unavailable or returned an unreadable response."
        )
    return read, warnings


def analyze_chart(image_bytes: bytes, content_type: str) -> Tuple[ChartAnalysisOut, List[str]]:
    """Return (analysis, warnings)."""
    warnings: List[str] = []
    if settings.vision_configured:
        result = _vision(image_bytes, content_type)
        if result is not None:
            return result, warnings
        warnings.append(
            "Vision model was configured but unavailable; showing the heuristic preview instead."
        )
    try:
        return _heuristic(image_bytes), warnings
    except Exception:  # noqa: BLE001 - any decode failure becomes user-facing
        return (
            ChartAnalysisOut(
                direction="NEUTRAL",
                label=_label_for("NEUTRAL"),
                tone="neutral",
                confidence=None,
                confidence_label="Not a probability",
                source="Unavailable",
                is_real=False,
                model_name=HEURISTIC_MODEL_NAME,
                explanation="This image could not be read. Please upload a PNG or JPEG chart screenshot.",
                evidence=[],
                disclaimer=DISCLAIMER,
            ),
            warnings,
        )
