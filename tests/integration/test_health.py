"""Integration tests for health / meta endpoints."""


class TestHealthEndpoint:
    def test_health_returns_200(self, client):
        r = client.get("/health")
        assert r.status_code == 200

    def test_health_body(self, client):
        r = client.get("/health")
        assert r.json() == {"status": "ok"}

    def test_root_returns_200_or_redirect(self, client):
        r = client.get("/")
        assert r.status_code in (200, 307)
