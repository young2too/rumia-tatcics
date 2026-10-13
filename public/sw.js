const DEFAULT_URL = "/pvp.html?tab=joined";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  const payload = event.data?.json?.() || {};
  const notification = payload.notification || payload;
  const title = notification.title || "루미아 택틱스 PvP";
  event.waitUntil(self.registration.showNotification(title, {
    body: notification.body || "PvP 게임에 새로운 진행 사항이 있습니다.",
    icon: notification.icon || "/assets/characters/000_Dr.Nadja.png",
    badge: notification.badge || "/assets/characters/000_Dr.Nadja.png",
    tag: notification.tag || "lumia-pvp",
    data: { url: notification.navigate || notification.url || notification.data?.url || DEFAULT_URL },
    renotify: true,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || DEFAULT_URL, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(targetUrl);
      return existing.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});
