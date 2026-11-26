/* 부산 여행 길라잡이 — Service Worker (Web Push)
 * 배포 경로: https://djdufs.github.io/Busan-trip/sw.js
 * 푸시 수신 → 알림 표시, 알림 클릭 → 사이트 창 포커스/새 창 열기.
 */
'use strict';

/* 캐시/배포 버전 — index.html의 등록 쿼리(?v=)와 함께 올린다 */
var SW_VERSION = '2026-11-27.1';

var SCOPE_URL = new URL('/Busan-trip/', self.location.origin).href;
var DEFAULT_ICON = '/Busan-trip/icons/icon-192.png';

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

function readPush(event) {
  var data = {};
  if (event.data) {
    try {
      data = event.data.json() || {};
    } catch (e) {
      try { data = { body: event.data.text() }; } catch (e2) { data = {}; }
    }
  }
  if (typeof data !== 'object' || data === null) data = {};
  return data;
}

self.addEventListener('push', function (event) {
  var data = readPush(event);
  var title = data.title || '🌊 부산 여행 길라잡이';
  var body = data.body || '새 소식이 있어요.';
  var options = {
    body: body,
    icon: data.icon || DEFAULT_ICON,
    badge: data.badge || DEFAULT_ICON,
    tag: data.tag || 'busan-trip',
    renotify: true,
    silent: false,
    vibrate: [90, 50, 90],
    timestamp: Date.parse(data.at || '') || Date.now(),
    data: {
      url: data.url || '/Busan-trip/',
      at: data.at || ''
    }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  var n = event.notification;
  var raw = (n && n.data && n.data.url) || '/Busan-trip/';
  var target;
  try { target = new URL(raw, self.location.origin).href; } catch (e) { target = SCOPE_URL; }
  if (n) n.close();

  event.waitUntil((async function () {
    var list = [];
    try { list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true }); } catch (e) { list = []; }
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url && c.url.indexOf(SCOPE_URL) === 0) {
        try { await c.focus(); } catch (e) {}
        if (target !== c.url && typeof c.navigate === 'function') {
          try { await c.navigate(target); } catch (e) {}
        }
        return;
      }
    }
    try { await self.clients.openWindow(target); } catch (e) {}
  })());
});

/* 구독이 만료/교체되면 조용히 로그만 남긴다 (재구독은 앱에서 안내) */
self.addEventListener('pushsubscriptionchange', function (event) {
  event.waitUntil(Promise.resolve());
});
