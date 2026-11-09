from app import app


def test_health():
    assert app.test_client().get("/health").status_code == 200
