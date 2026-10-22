// My Wealth 原始版本不啟用離線快取；清除早期版本保留的舊頁面。
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();
 await Promise.all(keys.filter(k=>k.startsWith('my-wealth-')||k.startsWith('pt-')).map(k=>caches.delete(k)));
 await self.registration.unregister();
 await self.clients.claim();
})()));
