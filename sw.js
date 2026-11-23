// 솔로운영 가계부 서비스 워커 (v18) — 캐시하지 않음. 홈 화면 설치 조건만 맞추고 모든 요청은 그대로 네트워크로.
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (event) => {
  // 페이지 이동(같은 주소 열기)만 네트워크로 그대로 전달. 나머지(Firebase·드라이브·이미지 등)는 손대지 않음 = 브라우저 기본 동작.
  if (event.request.mode === 'navigate') event.respondWith(fetch(event.request));
});
