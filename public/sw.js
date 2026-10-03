/* HQ's service worker. It shows a push notice and opens its page when the notice is
   tapped — always a page on HQ itself, whatever address the notice carried. It caches
   nothing: every screen is read fresh from the service. */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function ownPath(raw) {
  try {
    const target = new URL(raw, self.location.origin);
    return target.pathname + target.search;
  } catch {
    return "/inbox";
  }
}

self.addEventListener("push", (event) => {
  let notice = {};
  try {
    notice = event.data ? event.data.json() : {};
  } catch {
    notice = {};
  }
  const title =
    typeof notice.title === "string" && notice.title ? notice.title : "Quantify Terminal HQ";
  const tag = typeof notice.tag === "string" && notice.tag ? notice.tag : undefined;
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof notice.body === "string" ? notice.body : "",
      tag,
      renotify: Boolean(tag),
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { path: ownPath(typeof notice.url === "string" ? notice.url : "/inbox") },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.path) || "/inbox";
  const url = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          await client.focus();
          return client.navigate(url);
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
