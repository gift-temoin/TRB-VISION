import pytest
from httpx import AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import Settings, get_settings
from app.database import Base, get_db
from app.main import app
from app.models import User
from app.security import hash_password


class TestSettings(Settings):
    database_url: str = "sqlite://"
    secret_key: str = "test-secret"
    demo_mode: bool = True
    market_data_provider: str = "none"


test_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = sessionmaker(bind=test_engine, autoflush=False, autocommit=False, future=True)

Base.metadata.create_all(bind=test_engine)


def override_get_db():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


def override_get_settings():
    return TestSettings()


app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[get_settings] = override_get_settings


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def client():
    return AsyncClient(app=app, base_url="http://test")


@pytest.fixture
def db():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_user(db: Session, email: str = "test@example.com", country: str = "KE") -> User:
    user = User(
        full_name="Test User",
        email=email,
        country=country,
        password_hash=hash_password("TestPass123"),
        is_verified=True,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.mark.asyncio
async def test_countries_endpoint(client: AsyncClient):
    r = await client.get("/api/auth/countries")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 5
    codes = {c["code"] for c in data}
    assert codes == {"RW", "BI", "UG", "TZ", "KE"}
    for c in data:
        assert c["flag"]
        assert c["name"]


@pytest.mark.asyncio
async def test_signup_success(client: AsyncClient):
    r = await client.post(
        "/api/auth/signup",
        json={
            "full_name": "Jane Doe",
            "email": "jane@example.com",
            "country": "RW",
            "password": "TestPass123",
            "confirm_password": "TestPass123",
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert "access_token" in data
    assert data["user"]["email"] == "jane@example.com"
    assert data["user"]["country"] == "RW"
    assert data["user"]["country_name"] == "Rwanda"
    assert data["user"]["country_flag"] == "🇷🇼"
    assert data["user"]["is_verified"] is False


@pytest.mark.asyncio
async def test_signup_duplicate_email(client: AsyncClient):
    await client.post(
        "/api/auth/signup",
        json={
            "full_name": "Jane Doe",
            "email": "jane@example.com",
            "country": "RW",
            "password": "TestPass123",
            "confirm_password": "TestPass123",
        },
    )
    r = await client.post(
        "/api/auth/signup",
        json={
            "full_name": "Jane Doe",
            "email": "jane@example.com",
            "country": "KE",
            "password": "TestPass123",
            "confirm_password": "TestPass123",
        },
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_signup_invalid_country(client: AsyncClient):
    r = await client.post(
        "/api/auth/signup",
        json={
            "full_name": "Jane Doe",
            "email": "jane@example.com",
            "country": "XX",
            "password": "TestPass123",
            "confirm_password": "TestPass123",
        },
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, db: Session):
    create_user(db, email="login@example.com", country="UG")
    r = await client.post(
        "/api/auth/login",
        json={"email": "login@example.com", "password": "TestPass123"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert data["user"]["email"] == "login@example.com"
    assert data["user"]["country"] == "UG"


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient, db: Session):
    create_user(db, email="login@example.com", country="UG")
    r = await client.post(
        "/api/auth/login",
        json={"email": "login@example.com", "password": "WrongPass123"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_verification_flow(client: AsyncClient, db: Session):
    # First create an admin with a passcode
    from app.models import Passcode
    from app.security import hash_code

    admin = User(
        full_name="Admin",
        email="admin@test.com",
        country="KE",
        password_hash=hash_password("AdminPass123"),
        is_admin=True,
        is_verified=True,
        is_active=True,
    )
    db.add(admin)
    db.commit()

    passcode = Passcode(
        label="Test passcode",
        code_hash=hash_code("TRB-TEST-123"),
        max_uses=10,
        created_by_id=admin.id,
    )
    db.add(passcode)
    db.commit()

    # Signup a regular user
    r = await client.post(
        "/api/auth/signup",
        json={
            "full_name": "Verify User",
            "email": "verify@example.com",
            "country": "TZ",
            "password": "TestPass123",
            "confirm_password": "TestPass123",
        },
    )
    assert r.status_code == 201
    token = r.json()["access_token"]

    # Check verification status (should be unverified)
    r = await client.get(
        "/api/verification/status",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    assert r.json()["is_verified"] is False

    # Verify with correct passcode
    r = await client.post(
        "/api/verification/verify",
        headers={"Authorization": f"Bearer {token}"},
        json={"code": "TRB-TEST-123"},
    )
    assert r.status_code == 200
    assert r.json()["verified"] is True

    # Now user should be verified
    r = await client.get(
        "/api/verification/status",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.json()["is_verified"] is True


@pytest.mark.asyncio
async def test_verification_wrong_code(client: AsyncClient):
    r = await client.post(
        "/api/auth/signup",
        json={
            "full_name": "Verify User",
            "email": "verify2@example.com",
            "country": "TZ",
            "password": "TestPass123",
            "confirm_password": "TestPass123",
        },
    )
    token = r.json()["access_token"]

    r = await client.post(
        "/api/verification/verify",
        headers={"Authorization": f"Bearer {token}"},
        json={"code": "WRONG-CODE"},
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_predictions_require_verification(client: AsyncClient):
    # Unverified user
    r = await client.post(
        "/api/auth/signup",
        json={
            "full_name": "Unverified User",
            "email": "unverified@example.com",
            "country": "BI",
            "password": "TestPass123",
            "confirm_password": "TestPass123",
        },
    )
    token = r.json()["access_token"]

    r = await client.get(
        "/api/predictions/market/forex",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_messaging(client: AsyncClient, db: Session):
    user = create_user(db, email="msg@example.com", country="RW")
    # Get token by logging in
    r = await client.post(
        "/api/auth/login",
        json={"email": "msg@example.com", "password": "TestPass123"},
    )
    token = r.json()["access_token"]

    # Send a message
    r = await client.post(
        "/api/messages",
        headers={"Authorization": f"Bearer {token}"},
        json={"body": "Hello admin"},
    )
    assert r.status_code == 201

    # Get messages
    r = await client.get(
        "/api/messages",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["body"] == "Hello admin"


def _chart_bytes(green: int, red: int) -> bytes:
    import io

    from PIL import Image

    img = Image.new("RGB", (100, 100), (15, 20, 35))
    px = img.load()
    for i in range(green):
        px[i % 100, (i * 3) % 100] = (30, 200, 60)
    for i in range(red):
        px[(i * 7) % 100, (i * 5) % 100] = (220, 40, 40)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


async def _verified_token(client: AsyncClient, db: Session, email: str) -> str:
    create_user(db, email=email, country="KE")
    r = await client.post(
        "/api/auth/login", json={"email": email, "password": "TestPass123"}
    )
    return r.json()["access_token"]


@pytest.mark.asyncio
async def test_analyze_chart_requires_verification(client: AsyncClient):
    r = await client.post(
        "/api/auth/signup",
        json={
            "full_name": "Unverified User",
            "email": "chart-unverified@example.com",
            "country": "BI",
            "password": "TestPass123",
            "confirm_password": "TestPass123",
        },
    )
    token = r.json()["access_token"]
    r = await client.post(
        "/api/predictions/analyze-chart",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("chart.png", _chart_bytes(400, 50), "image/png")},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_analyze_chart_bullish(client: AsyncClient, db: Session):
    token = await _verified_token(client, db, "chart-bull@example.com")
    r = await client.post(
        "/api/predictions/analyze-chart",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("chart.png", _chart_bytes(500, 30), "image/png")},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["direction"] == "BULLISH"
    assert data["tone"] == "bull"
    assert data["confidence"] is None
    assert data["disclaimer"]


@pytest.mark.asyncio
async def test_analyze_chart_bearish(client: AsyncClient, db: Session):
    token = await _verified_token(client, db, "chart-bear@example.com")
    r = await client.post(
        "/api/predictions/analyze-chart",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("chart.png", _chart_bytes(30, 500), "image/png")},
    )
    assert r.status_code == 200
    assert r.json()["direction"] == "BEARISH"


@pytest.mark.asyncio
async def test_analyze_chart_rejects_non_image(client: AsyncClient, db: Session):
    token = await _verified_token(client, db, "chart-bad@example.com")
    r = await client.post(
        "/api/predictions/analyze-chart",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_forex_endpoints_require_verification(client: AsyncClient):
    r = await client.post(
        "/api/auth/signup",
        json={
            "full_name": "Unverified Forex",
            "email": "forex-unverified@example.com",
            "country": "BI",
            "password": "TestPass123",
            "confirm_password": "TestPass123",
        },
    )
    token = r.json()["access_token"]
    for path in (
        "/api/forex/candles",
        "/api/forex/analysis",
        "/api/forex/evaluate",
        "/api/forex/indicators/info",
    ):
        r = await client.get(path, headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 403, path


@pytest.mark.asyncio
async def test_forex_analysis_sample_mode(client: AsyncClient, db: Session):
    token = await _verified_token(client, db, "forex@example.com")
    r = await client.get(
        "/api/forex/analysis?symbol=EUR/USD&interval=H1",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["status"]["is_sample"] is True
    assert data["status"]["is_live"] is False
    assert "sample" in data["status"]["provider"].lower()
    keys = {i["key"] for i in data["indicators"]}
    assert {"ema20", "ema50", "rsi14", "adx14", "atr14"} <= keys
    # every indicator carries a plain-language explanation
    for i in data["indicators"]:
        assert i["what"] and i["how"] and i["contributes"]
    assert data["structure"]["summary"]
    assert data["disclaimer"]


@pytest.mark.asyncio
async def test_forex_candles_and_warnings(client: AsyncClient, db: Session):
    token = await _verified_token(client, db, "forex2@example.com")
    r = await client.get(
        "/api/forex/candles?symbol=EUR/USD&interval=M15",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data["candles"]) > 50
    assert {"ts", "open", "high", "low", "close", "complete"} <= set(data["candles"][0].keys())
    assert "H1" in data["available_intervals"]
    # Demo data must never be presented as live.
    assert data["status"]["is_sample"] is True


@pytest.mark.asyncio
async def test_forex_indicators_info_explains_each(client: AsyncClient, db: Session):
    token = await _verified_token(client, db, "forex3@example.com")
    r = await client.get(
        "/api/forex/indicators/info", headers={"Authorization": f"Bearer {token}"}
    )
    assert r.status_code == 200
    info = {i["key"]: i for i in r.json()}
    assert {"ema20", "ema50", "rsi14", "adx14", "atr14", "swing"} <= set(info)
    assert "average" in info["atr14"]["what"].lower()


@pytest.mark.asyncio
async def test_forex_evaluation_chronological(client: AsyncClient, db: Session):
    token = await _verified_token(client, db, "forex4@example.com")
    r = await client.get(
        "/api/forex/evaluate?symbol=EUR/USD&interval=H1&train_ratio=0.7",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["available"] is True
    assert data["train_end"] < data["test_start"]
    assert data["train_samples"] > 0 and data["test_samples"] > 0
    assert len(data["baselines"]) >= 4
    assert data["disclaimer"]


# --------------------------------------------------------------------------- #
# ChartMind (AI Chart Analyzer)
# --------------------------------------------------------------------------- #
async def _chartmind_analyze(client: AsyncClient, token: str, **overrides) -> dict:
    data = {"symbol": "EUR/USD", "interval": "H1", "candles": "100", "future_candles": "0"}
    data.update({k: str(v) for k, v in overrides.items()})
    r = await client.post(
        "/api/chartmind/analyze",
        headers={"Authorization": f"Bearer {token}"},
        data=data,
    )
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.asyncio
async def test_chartmind_requires_verification(client: AsyncClient):
    r = await client.post(
        "/api/auth/signup",
        json={
            "full_name": "Unverified Mind",
            "email": "mind-unverified@example.com",
            "country": "BI",
            "password": "TestPass123",
            "confirm_password": "TestPass123",
        },
    )
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    r = await client.post("/api/chartmind/analyze", headers=headers)
    assert r.status_code == 403
    r = await client.get("/api/chartmind/analyses", headers=headers)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_chartmind_analyze_sample_mode(client: AsyncClient, db: Session):
    token = await _verified_token(client, db, "mind1@example.com")
    data = await _chartmind_analyze(client, token, future_candles=10)
    assert data["status"]["is_sample"] is True
    assert data["status"]["is_live"] is False
    assert data["candles_analyzed"] > 0
    assert data["structure"]["summary"]
    assert data["summary"]
    assert data["disclaimer"]
    assert len(data["limitations"]) >= 3
    assert len(data["pipeline"]) >= 6
    assert data["future_marker"] is not None
    # Levels/zones, when present, must carry an explanation and be finite.
    for lvl in data["levels"]:
        assert lvl["explanation"]
        assert lvl["kind"] in ("support", "resistance")
    for z in data["zones"]:
        assert z["upper"] >= z["lower"]


@pytest.mark.asyncio
async def test_chartmind_analyze_with_screenshot(client: AsyncClient, db: Session):
    token = await _verified_token(client, db, "mind-shot@example.com")
    r = await client.post(
        "/api/chartmind/analyze",
        headers={"Authorization": f"Bearer {token}"},
        data={"symbol": "EUR/USD", "interval": "H1", "candles": "100"},
        files={"file": ("chart.png", _chart_bytes(500, 30), "image/png")},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["screenshot"] is not None
    assert data["screenshot"]["direction"] in ("BULLISH", "BEARISH", "NEUTRAL")
    assert data["screenshot"]["visible_levels_note"]
    assert any(p["key"] == "screenshot" for p in data["pipeline"])


@pytest.mark.asyncio
async def test_chartmind_rejects_non_image_screenshot(client: AsyncClient, db: Session):
    token = await _verified_token(client, db, "mind-bad@example.com")
    r = await client.post(
        "/api/chartmind/analyze",
        headers={"Authorization": f"Bearer {token}"},
        data={"symbol": "EUR/USD", "interval": "H1", "candles": "100"},
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_chartmind_save_history_lifecycle(client: AsyncClient, db: Session):
    token = await _verified_token(client, db, "mind-save@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    result = await _chartmind_analyze(client, token)

    r = await client.post("/api/chartmind/analyses", headers=headers, json={"result": result})
    assert r.status_code == 201, r.text
    saved = r.json()
    assert saved["id"] > 0
    assert saved["symbol"] == "EUR/USD"
    assert saved["result"]["candles_analyzed"] == result["candles_analyzed"]

    r = await client.get("/api/chartmind/analyses", headers=headers)
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert items[0]["id"] == saved["id"]

    r = await client.get(f"/api/chartmind/analyses/{saved['id']}", headers=headers)
    assert r.status_code == 200
    assert r.json()["result"]["structure"]["summary"]

    r = await client.delete(f"/api/chartmind/analyses/{saved['id']}", headers=headers)
    assert r.status_code == 204
    r = await client.get(f"/api/chartmind/analyses/{saved['id']}", headers=headers)
    assert r.status_code == 404
    r = await client.get("/api/chartmind/analyses", headers=headers)
    assert r.json() == []


@pytest.mark.asyncio
async def test_chartmind_history_isolation(client: AsyncClient, db: Session):
    token_a = await _verified_token(client, db, "mind-a@example.com")
    token_b = await _verified_token(client, db, "mind-b@example.com")
    result = await _chartmind_analyze(client, token_a)

    r = await client.post(
        "/api/chartmind/analyses",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"result": result},
    )
    saved_id = r.json()["id"]

    headers_b = {"Authorization": f"Bearer {token_b}"}
    # User B must not see or reach user A's private analysis.
    r = await client.get("/api/chartmind/analyses", headers=headers_b)
    assert r.json() == []
    r = await client.get(f"/api/chartmind/analyses/{saved_id}", headers=headers_b)
    assert r.status_code == 404
    r = await client.delete(f"/api/chartmind/analyses/{saved_id}", headers=headers_b)
    assert r.status_code == 404

    # And it is still there for its real owner.
    r = await client.get(f"/api/chartmind/analyses/{saved_id}", headers={"Authorization": f"Bearer {token_a}"})
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_chartmind_trade_plan_and_demand_overlay(client: AsyncClient, db: Session):
    token = await _verified_token(client, db, "mind-plan@example.com")
    data = await _chartmind_analyze(client, token, future_candles=15)

    plan = data["trade_plan"]
    assert plan is not None and plan["available"] is True
    assert plan["bias"] in ("BULLISH", "BEARISH", "NEUTRAL")
    # The two rectangles sit on opposite sides of the boundary (the entry/reference line).
    assert plan["boundary"] == plan["entry"]
    body_mid = (plan["body_lower"] + plan["body_upper"]) / 2
    risk_mid = (plan["risk_lower"] + plan["risk_upper"]) / 2
    assert (body_mid - plan["boundary"]) * (risk_mid - plan["boundary"]) <= 0
    assert plan["body_upper"] >= plan["body_lower"]
    assert plan["risk_upper"] >= plan["risk_lower"]
    assert plan["atr"] > 0
    assert plan["future_candles"] == 15
    # Future timestamp is strictly ahead of the anchor candle.
    assert plan["future_ts"] > plan["entry_ts"]
    assert plan["explanation"]
    assert plan["labels"]["body"] and plan["labels"]["risk"] and plan["labels"]["boundary"]
    assert len(plan["notes"]) >= 2
    if plan["bias"] in ("BULLISH", "BEARISH"):
        assert plan["reward_risk"] is not None and plan["reward_risk"] > 0

    # Demand/supply zone is derived from measured OHLC levels, never inverted.
    dz = data["demand_zone"]
    if dz is not None:
        assert dz["role"] in ("demand", "supply")
        assert dz["upper"] >= dz["lower"]
        assert dz["explanation"]
        assert dz["touches"] >= 1

    # The overlay stage is reported in the pipeline.
    assert any(p["key"] == "overlay" for p in data["pipeline"])


if __name__ == "__main__":
    pytest.main([__file__, "-v"])