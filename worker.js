//array of folders (or files for that matter) to always serve from cache. This still follows the max-age of cache currently set to 1 month in func checkCache()
const keepInCache = [
	'/notfound.html',
	'/assets/css',
	'/assets/fontawesome',
	'/assets/images',
	'/assets/js',
	'/public'
];
const cacheTime = 1000 * 60 * 60 * 24 * 30; //how much time to keep things in cache (30 days)
const notfound = '/notfound.html';

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
	fetch(notfound + '?v=1.0.1').then(res => {
		if (res.ok) caches.open('cache').then(cache => cache.put(notfound, res.clone()));
	});
});

//global message receiver
self.addEventListener('message', event => {
	switch (event.data.command) {
		case 'purge': //Purge old caches. Requirements are: the page is expired and the client is online.
			caches.open('cache').then(cache => cache.keys()
				.then(keyList =>
					Promise.all(
						keyList.map(key => {
							caches.match(key).then(res => {
								if (res.url == notfound) return; //do not delete notfound.html!

								const date = new Date(res.headers.get('date')) //calculate expiration date and
								if (Date.now() >= date.getTime() + cacheTime && navigator.onLine) cache.delete(res.url); //delete file if expired
							});
						}),
					),
				),
			);
			break;
		case 'download_count':
			checkCache(event.data.request, 1000 * 60 * 60 * 24 * 1).then(cache => { //1 day of cache for this
				let answer = false;

				if (cache.cache != null) { //always answer fast if any cache is available
					cache.cache.json().then(json => event.ports[0].postMessage(json));
					answer = true;
				}

				if (cache.expired) { //then check if we need to refresh/build the cache
					fetch(event.data.request).then(res => {
						if (res.ok) { //if the response is 2xx then we can proceed and cache the page + return result
							caches.open('cache').then(cache => {
								cache.put(event.data.request, res.clone());
								if (!answer) //only return if not already posted back
									res.json().then(json => event.ports[0].postMessage(json));
							});
						}
						else throw new Error("Network response was not OK");
					});
				}
			});
			break;
	}
});

//cache the pages for offline usage
self.addEventListener('fetch', event => {
	event.respondWith(async function () {
		let skipCache = false;

		//first thing to check: is this an URL that we always need to serve from cache? If so skip fetch
		for (entry of keepInCache) {
			if (event.request.url.startsWith(this.origin + entry)) {
				const res = await checkCache(event.request.url);

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
			if (!skipCache) return await checkCache(event.request.url).cache;
		}

		return await fetch(notfound); //as last resort
	}());
});

//convenient method to check for match of given URL in cache
async function checkCache(url, time) {
	if (time === undefined) time = cacheTime;
	const cache = await caches.open('cache');
	const cached = await cache.match(url);

	if (url == notfound) //never delete notfound!
		return {
			cache: cached,
			expired: false
		};

	if (cached) { //if cache is there always return it
		const date = new Date(cached.headers.get('date'));
		let expired = false;

		if (Date.now() >= date.getTime() + time)
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