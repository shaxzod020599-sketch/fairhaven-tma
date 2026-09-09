"""Pure routing regressions; no browser, sockets, or backend."""

from types import SimpleNamespace
import unittest

from yandex_orders_smoke import Fixtures


class Route:
    def __init__(self, url):
        self.request = SimpleNamespace(url=url, method="GET")
        self.result = None

    def continue_(self):
        self.result = ("continue", None)

    def abort(self):
        self.result = ("abort", None)

    def fulfill(self, **response):
        self.result = ("fulfill", response["status"])


class FixtureRoutesTest(unittest.TestCase):
    def test_unknown_proxy_paths_never_reach_backend(self):
        for path in ("/api", "/api/unknown", "/api-probe",
                     "/api%252Fadmin%252Fyandex%252Forders", "/%61pi/unknown"):
            with self.subTest(path=path):
                fixture = Fixtures("http://127.0.0.1:5189")
                route = Route(fixture.origin + path)
                fixture.route(route)
                self.assertEqual(route.result, ("fulfill", 404))
                self.assertEqual(len(fixture.unexpected_api), 1)
                self.assertEqual(fixture.fixture_errors, [])

    def test_known_api_is_synthetic(self):
        fixture = Fixtures("http://127.0.0.1:5189")
        route = Route(fixture.origin + "/api/admin/auth/whoami")
        fixture.route(route)
        self.assertEqual(route.result, ("fulfill", 200))

    def test_static_asset_can_continue(self):
        fixture = Fixtures("http://127.0.0.1:5189")
        route = Route(fixture.origin + "/src/main.jsx")
        fixture.route(route)
        self.assertEqual(route.result, ("continue", None))

    def test_external_origin_is_aborted(self):
        fixture = Fixtures("http://127.0.0.1:5189")
        route = Route("https://example.invalid/api/admin/orders")
        fixture.route(route)
        self.assertEqual(route.result, ("abort", None))
        self.assertEqual(len(fixture.blocked_external), 1)


if __name__ == "__main__":
    unittest.main()
