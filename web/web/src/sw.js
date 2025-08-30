self.__WB_MANIFEST;
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}
  const title = 'NeonTalk';
  const body = data?.body || 'Новое сообщение';
  event.waitUntil(self.registration.showNotification(title, { body }));
});

