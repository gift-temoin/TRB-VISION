from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import require_verified
from ..models import User
from ..schemas import ForexAnalysisOut, ForexCandlesOut, ForexEvaluationOut, IndicatorInfoOut
from ..services import indicators as ind
from ..services.candle_validation import validate_candles
from ..services.forex_analysis import get_analysis, get_candles, persist_candles
from ..services.forex_data import (
    SUPPORTED_INTERVALS,
    ProviderError,
    fetch_candles,
    normalize_interval,
)
from ..services.historical_eval import evaluate

router = APIRouter(prefix="/forex", tags=["forex"])

DEFAULT_SYMBOL = "EUR/USD"


@router.get("/intervals", response_model=list[str])
def intervals(user: User = Depends(require_verified)) -> list[str]:
    return SUPPORTED_INTERVALS


@router.get("/indicators/info", response_model=list[IndicatorInfoOut])
def indicators_info(user: User = Depends(require_verified)) -> list[IndicatorInfoOut]:
    """Plain-language description of every indicator used (requirement: explain each)."""
    out: list[IndicatorInfoOut] = []
    for key, meta in ind.EXPLANATIONS.items():
        window = meta["window"].split(" ")[0]
        out.append(
            IndicatorInfoOut(
                key=key,
                name=meta["name"],
                period=int(window) if window.isdigit() else None,
                what=meta["what"],
                how=meta["how"],
                contributes=meta["contributes"],
                ready=True,
            )
        )
    return out


@router.get("/candles", response_model=ForexCandlesOut)
def candles(
    symbol: str = Query(default=DEFAULT_SYMBOL, max_length=32),
    interval: str = Query(default=settings.forex_default_interval),
    user: User = Depends(require_verified),
) -> ForexCandlesOut:
    interval = normalize_interval(interval)
    try:
        return get_candles(symbol, interval)
    except ProviderError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.get("/analysis", response_model=ForexAnalysisOut)
def analysis(
    symbol: str = Query(default=DEFAULT_SYMBOL, max_length=32),
    interval: str = Query(default=settings.forex_default_interval),
    store: bool = Query(default=False, description="Persist real candles for offline research."),
    db: Session = Depends(get_db),
    user: User = Depends(require_verified),
) -> ForexAnalysisOut:
    interval = normalize_interval(interval)
    try:
        result = get_analysis(symbol, interval)
    except ProviderError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    if store:
        try:
            raw = fetch_candles(symbol, interval)
            vr = validate_candles(raw, interval)
            persist_candles(db, symbol, interval, vr.completed)
        except ProviderError:
            pass
    return result


@router.get("/evaluate", response_model=ForexEvaluationOut)
def evaluate_endpoint(
    symbol: str = Query(default=DEFAULT_SYMBOL, max_length=32),
    interval: str = Query(default=settings.forex_default_interval),
    train_ratio: float = Query(default=settings.forex_eval_train_ratio, ge=0.3, le=0.9),
    user: User = Depends(require_verified),
) -> ForexEvaluationOut:
    interval = normalize_interval(interval)
    try:
        raw = fetch_candles(symbol, interval)
    except ProviderError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    vr = validate_candles(raw, interval)
    return evaluate(vr.completed, symbol, interval, train_ratio=train_ratio)
