from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status

from ..config import settings
from ..deps import require_verified
from ..models import User
from ..schemas import ChartAnalysisOut, InstrumentOut, MarketResponse
from ..services.chart_analysis import ALLOWED_TYPES, MAX_BYTES, analyze_chart
from ..services.market_data import instruments_for, market_data
from ..services.prediction import prediction_service

router = APIRouter(prefix="/predictions", tags=["predictions"])

VALID_MARKETS = {"forex", "gold", "crypto", "binary"}


@router.get("/instruments", response_model=list[InstrumentOut])
def instruments(
    category: str | None = Query(default=None),
    user: User = Depends(require_verified),
) -> list[InstrumentOut]:
    if category and category not in VALID_MARKETS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown market category.")
    return [
        InstrumentOut(
            symbol=i.symbol,
            name=i.name,
            category=i.category,
            quote_currency=i.quote_currency,
            provider_symbol=i.provider_symbol,
        )
        for i in instruments_for(category)
    ]


@router.get("/market/{category}", response_model=MarketResponse)
def market(category: str, user: User = Depends(require_verified)) -> MarketResponse:
    category = category.lower()
    if category not in VALID_MARKETS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown market category.")

    insts = instruments_for(category)
    quotes = [market_data.get_quote(i) for i in insts]
    predictions = prediction_service.predict_all(insts)

    message = None
    if not market_data.configured:
        if settings.demo_mode:
            message = (
                "Demo mode: no live market data provider is configured. Prices and signals shown "
                "are clearly-labelled sample data for interface preview only."
            )
        else:
            message = (
                "No live market data provider is configured. Predictions are unavailable until a "
                "provider and tested prediction engine are set up on the server."
            )

    return MarketResponse(
        market=category,
        quotes=quotes,
        predictions=predictions,
        provider_configured=market_data.configured,
        message=message,
    )


@router.post("/analyze-chart", response_model=ChartAnalysisOut)
async def analyze_chart_endpoint(
    file: UploadFile = File(...),
    user: User = Depends(require_verified),
) -> ChartAnalysisOut:
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported image type. Please upload a PNG, JPEG or WebP screenshot.",
        )
    data = await file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file.")
    if len(data) > MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image is too large. Maximum size is 6 MB.",
        )
    result, warnings = analyze_chart(data, content_type)
    result.warnings = warnings
    return result

