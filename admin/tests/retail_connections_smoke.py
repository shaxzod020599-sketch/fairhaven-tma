"""Local-only browser check; every API request is fulfilled from synthetic data."""
import json
from pathlib import Path
from urllib.parse import urlsplit, unquote
from playwright.sync_api import sync_playwright, expect

ORIGIN = 'http://127.0.0.1:5191'
KEY = '111111111111111111111111'
OUT = Path('/tmp/fairhaven-retail-connections-proof')

def main():
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for width in (1440, 390):
            errors = []
            unexpected = []
            context = browser.new_context(viewport={'width': width, 'height': 900}, service_workers='block')
            def intercept(route):
                req = route.request
                target = urlsplit(req.url)
                if f'{target.scheme}://{target.netloc}' != ORIGIN:
                    unexpected.append('external'); route.abort(); return
                path = unquote(target.path)
                if not target.path.startswith('/api') and not path.startswith('/api'):
                    route.continue_(); return
                data = {
                    '/api/admin/auth/whoami': {'isAdmin': True, 'firstName': 'Fixture', 'telegramId': 901, 'csrfToken': 'fixture-csrf'},
                    '/api/admin/channels/sync': {'mirrorTotal': 0, 'last': None},
                    '/api/admin/channels/settings': {},
                    '/api/admin/channels/keys': [],
                    '/api/admin/channels/medicalka/partner': {'activeEnvironment': '', 'profiles': []},
                    '/api/admin/channels/connections': {'place': 'fairhaven-store-1', 'channels': [
                        {'channel': c, 'host': f'https://api.fairhaven.uz/{c}', 'enabled': False, 'placeConfigured': False, 'runtimePlace': '',
                         'keys': [{'id': KEY, 'clientId': 'fixture-client', 'label': '', 'secretAvailable': True}] if c == 'uzum' else []}
                        for c in ('uzum', 'yandex')]},
                }
                if req.method == 'GET' and path in data:
                    value = data[path]
                elif req.method == 'POST' and path == f'/api/admin/channels/connections/{KEY}/reveal':
                    assert req.headers.get('x-fh-csrf') == 'fixture-csrf'
                    value = {'id': KEY, 'channel': 'uzum', 'clientId': 'fixture-client', 'clientSecret': 'SYNTHETIC-SECRET-NOT-LIVE'}
                else:
                    unexpected.append(path); route.fulfill(status=500, content_type='application/json', body='{}'); return
                route.fulfill(status=200, content_type='application/json', body=json.dumps({'success': True, 'data': value}))
            context.route('**/*', intercept)
            page = context.new_page()
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto(ORIGIN + '/connections'); page.wait_for_load_state('networkidle')
            expect(page.get_by_role('button', name='Данные подключения', exact=True)).to_be_visible()
            page.get_by_role('button', name='Данные подключения', exact=True).click()
            expect(page.get_by_text('fixture-client', exact=True)).to_be_visible()
            page.get_by_role('button', name='Показать Client secret', exact=True).click()
            expect(page.get_by_text('SYNTHETIC-SECRET-NOT-LIVE', exact=True)).to_be_visible()
            page.screenshot(path=str(OUT / f'connections-{width}.png'), full_page=True)
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), page.evaluate('({width:innerWidth, scroll:document.documentElement.scrollWidth})')
            page.get_by_role('button', name='Закрыть данные', exact=True).click()
            expect(page.get_by_text('SYNTHETIC-SECRET-NOT-LIVE', exact=True)).to_have_count(0)
            assert not errors, errors
            assert not unexpected, unexpected
            context.close()
        browser.close()
    print('Retail browser check: desktop/mobile passed; zero external/API escapes or page errors')

if __name__ == '__main__':
    main()
