from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_verified
from ..models import ChartMindAnalysis, User
from ..schemas import (
    ChartMindHistoryItemOut,
    ChartMindResultOut,
    ChartMindSaveRequest,
    ChartMindSavedOut,
)
from ..services.chart_analysis import ALLOWED_TYPES, MAX_BYTES
from ..services.chartmind import DEFAULT_CANDLES, MAX_CANDLES, ScreenshotInput, analyze, direction_for_result
from ..services.forex_data import ProviderError

router = APIRouter(prefix="/chartmind", tags=["chartmind"])

DEFAULT_SYMBOL = "EUR/USD"


def _to_history_item(row: ChartMindAnalysis) -> ChartMindHistoryItemOut:
    return ChartMindHistoryItemOut(
        id=row.id,
        title=row.title,
        symbol=row.symbol,
        interval=row.interval,
        trend=row.trend,
        direction=row.direction,
        data_source=row.data_source,
        is_real=row.is_real,
        has_screenshot=row.has_screenshot,
        candles_analyzed=row.candles_analyzed,
        summary=row.summary,
        created_at=row.created_at,
    )


@router.post("/analyze", response_model=ChartMindResultOut)
async def analyze_endpoint(
    symbol: str = Form(default=DEFAULT_SYMBOL, max_length=32),
    interval: str = Form(default="H1", max_length=8),
    candles: int = Form(default=DEFAULT_CANDLES, ge=10, le=MAX_CANDLES),
    future_candles: int = Form(default=0, ge=0, le=500),
    screenshot_instrument: Optional[str] = Form(default=None, max_length=32),
    screenshot_timeframe: Optional[str] = Form(default=None, max_length=16),
    file: Optional[UploadFile] = File(default=None),
    user: User = Depends(require_verified),
) -> ChartMindResultOut:
    """Run the full ChartMind pipeline on genuine candles, plus an optional screenshot."""
    screenshot: Optional[ScreenshotInput] = None

    if file is not None and file.filename:
        content_type = (file.content_type or "").lower()
        if content_type not in ALLOWED_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsupported screenshot type. Please upload a PNG, JPEG or WebP image.",
            )
        data = await file.read()
        if not data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty screenshot file.")
        if len(data) > MAX_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Screenshot is too large. Maximum size is 6 MB.",
            )
        screenshot = ScreenshotInput(
            data=data,
            content_type=content_type,
            instrument_hint=screenshot_instrument or None,
            timeframe_hint=screenshot_timeframe or None,
        )

    try:
        return analyze(
            symbol=symbol,
            interval=interval,
            candles=candles,
            future_candles=future_candles,
            screenshot=screenshot,
        )
    except ProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc


@router.post("/analyses", response_model=ChartMindSavedOut, status_code=status.HTTP_201_CREATED)
def save_analysis(
    body: ChartMindSaveRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_verified),
) -> ChartMindSavedOut:
    result = body.result
    title = (body.title or "").strip() or (
        f"{result.symbol} · {result.interval} · {result.status.provider}"
    )
    direction = direction_for_result(result)
    row = ChartMindAnalysis(
        user_id=user.id,
        title=title[:160],
        symbol=result.symbol,
        interval=result.interval,
        trend=result.structure.trend,
        direction=direction,
        data_source=result.status.provider,
        is_real=result.status.is_live,
        has_screenshot=result.screenshot is not None,
        candles_analyzed=result.candles_analyzed,
        summary=result.summary[:2000],
        result_json=result.model_dump_json(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return ChartMindSavedOut(**_to_history_item(row).model_dump(), result=result)


@router.get("/analyses", response_model=List[ChartMindHistoryItemOut])
def list_analyses(
    db: Session = Depends(get_db),
    user: User = Depends(require_verified),
) -> List[ChartMindHistoryItemOut]:
    rows = (
        db.query(ChartMindAnalysis)
        .filter(ChartMindAnalysis.user_id == user.id)
        .order_by(ChartMindAnalysis.created_at.desc(), ChartMindAnalysis.id.desc())
        .all()
    )
    return [_to_history_item(r) for r in rows]


def _owned_or_404(db: Session, user: User, analysis_id: int) -> ChartMindAnalysis:
    row = (
        db.query(ChartMindAnalysis)
        .filter(ChartMindAnalysis.id == analysis_id, ChartMindAnalysis.user_id == user.id)
        .one_or_none()
    )
    if row is None:
        # 404 (not 403) so users cannot probe for other users' analyses.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found.")
    return row


@router.get("/analyses/{analysis_id}", response_model=ChartMindSavedOut)
def get_analysis(
    analysis_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_verified),
) -> ChartMindSavedOut:
    row = _owned_or_404(db, user, analysis_id)
    result = ChartMindResultOut.model_validate_json(row.result_json)
    return ChartMindSavedOut(**_to_history_item(row).model_dump(), result=result)


@router.delete("/analyses/{analysis_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_analysis(
    analysis_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_verified),
) -> None:
    row = _owned_or_404(db, user, analysis_id)
    db.delete(row)
    db.commit()
