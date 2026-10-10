/* Quote My Garage service worker.
 *
 * Deliberately small: it shows push notifications and, when someone is offline, a friendly page instead of the browser's
 * error. It does NOT cache pages or API responses, so signed-in data is never served stale or to the wrong person. */

const OFFLINE_URL = "/offline"
const CACHE = "qmg-offline-v1"

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)).then(() => self.skipWaiting()))
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// Only page navigations fall back to the offline page; everything else goes straight to the network.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)))
})

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: "Quote My Garage", body: event.data ? event.data.text() : "" }
  }
  const title = data.title || "Quote My Garage"
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/192",
      badge: "/icons/192",
      data: { url: data.url || "/" },
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || "/"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      // Reuse an open tab on the same origin if there is one.
      for (const w of windows) {
        if ("focus" in w && new URL(w.url).origin === new URL(url, self.location.origin).origin) {
          w.navigate(url)
          return w.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
