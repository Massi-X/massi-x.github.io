//array of folders (or files for that matter) to always serve from cache. This still follows the max-age of cache currently set to 1 month in func checkCache()
const keepInCache = [
	'/assets/css',
	'/assets/fontawesome',
	'/assets/images',
	'/assets/js',
	'/public'
];
//how much time to keep things in cache (30 days)
const cacheTime = 1000 * 60 * 60 * 24 * 30;

//took from https://googlechrome.github.io/samples/service-worker/fallback-response/
self.addEventListener('install', event => {
	// Skip the 'waiting' lifecycle phase, to go directly from 'installed' to 'activated', even if
	// there are still previous incarnations of this service worker registration active.
	event.waitUntil(self.skipWaiting());
});

//took from https://googlechrome.github.io/samples/service-worker/fallback-response/
self.addEventListener('activate', event => {
	// Claim any clients immediately, so that the page will be under SW control without reloading.
	event.waitUntil(self.clients.claim());

	//cache the error page for use with navigate JS. If an update is needed put a versioning number there
	fetch('/notfound.html?v=1.0.1').then(res => {
		if (res.ok) caches.open('cache').then(cache => cache.put('/notfound.html', res.clone()));
	});

	//Purge old caches on each update
	caches.keys().then(function (names) {
		for (let name of names) caches.delete(name);
	});

});

//cache the pages for offline usage
self.addEventListener('fetch', event => {
	event.respondWith(async function () {
		let skipCache = false;

		//first thing to check: is this an URL that we always need to serve from cache? If so skip fetch
		for (entry of keepInCache) {
			if (event.request.url.startsWith(this.origin + entry)) {
				const res = await checkCache(caches, event.request, event.request.url);

				//return cache if valid -or- if expired but navigator is offline
				if (res.cache != null && (!res.expired || res.expired && !navigator.onLine))
					return res.cache;
				else {
					skipCache = true; //skip another check in cache in case this page does not exist or you're offline and is not cached in the next steps
					break;
				}
			}
		};

		try { //try to check if there is a live version of the url
			let res = await fetch(event.request);

			if (res.ok) { //if the response is 2xx then we can proceed and cache the page
				const cache = await caches.open('cache');
				cache.put(event.request.url, res.clone());
			}

			return res; //in any case, return the response
		}
		catch (error) { //this should only happen if we are offline (or on Promise error). We check for a cached version of the file
			if (!skipCache) return await checkCache(caches, event.request, event.request.url);
		}

		return await fetch('notfound.html'); //as last resort
	}());
});

//convenient method to check for match of given URL in cache
async function checkCache(caches, request, url) {
	const cache = await caches.open('cache');
	const cached = await cache.match(request);

	if (url == '/notfound.html') //never delete notfound!
		return {
			cache: cached,
			expired: false
		};

	if (cached) { //if cache is there always return it
		const date = new Date(cached.headers.get('date'));
		let expired = false;

		if (Date.now() >= date.getTime() + cacheTime)
			expired = true;

		return {
			cache: cached,
			expired: expired
		};
	}

	return {
		cache: null,
		expired: true
	};;
}