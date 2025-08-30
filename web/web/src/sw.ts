declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any };
self.__WB_MANIFEST;
self.addEventListener('push', (event: any) => {
  let data = {} as any;
  try { data = event.data?.json() || {}; } catch {}
  const title = 'NeonTalk';
  const body = data?.body || 'Новое сообщение';
  event.waitUntil((self as any).registration.showNotification(title, { body }));
});

