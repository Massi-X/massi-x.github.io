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

	//cache the error page for use with navigate JS
	fetch('/notfound.html').then(res => {
		if (res.ok) caches.open('cache').then(cache => cache.put('/notfound.html', res.clone())); //if an update is needed put a versioning number
	});
});

//cache the pages for offline usage
self.addEventListener('fetch', event => {
	event.respondWith(async function () {
		let skipCache = false;

		//first thing to check: is this an URL that we always need to serve from cache? If so skeep fetch
		for (entry of keepInCache) {
			let matchedURL = this.origin + entry;
			if (event.request.url.startsWith(matchedURL)) {
				let res = await checkCache(caches, event.request, event.request.url);

				if (res)
					return res;
				else {
					skipCache = true; //skip another check in cache in case this page does not exist or you're offline and is not cached in the next steps
					break;
				}
			}
		};

		try { //try to check if there is a live version of the url
			let res = await fetch(event.request);

			if (res.ok) { //if the response is 2xx then we can proceed and cache the page
				var cache = await caches.open('cache');
				cache.put(event.request.url, res.clone());
			}

			return res; //in any case, return the response
		}
		catch (error) { //this should only happen if we are offline (or on server error). We check for a cached version of the file
			if (!skipCache) return await checkCache(caches, event.request, event.request.url);
		}

		//if we reach here it means nothing had success. Let the browser handle the rest
	}());
});

//array of folders (or files for that matter) to always serve from cache. This still follows the max-age of cache currently set to 1 month in func checkCache()
const keepInCache = [
	'/assets/css',
	'/assets/fontawesome',
	'/assets/images',
	'/assets/js',
	'/public'
];

//convenient method to check for match of given URL in cache
async function checkCache(caches, request, url) {
	let cached = await caches.match(request);

	if (url == '/notfound.html')
		return cached;

	if (cached) { //if cached we check if not expired (1 month currently)
		const date = new Date(cached.headers.get('date'))

		if (Date.now() < date.getTime() + 1000 * 60 * 60 * 24 * 30)
			return cached;
	}

	return null;
}