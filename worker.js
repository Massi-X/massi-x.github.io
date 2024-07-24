const cacheTimeShort = 1000 * 60 * 60 * 2;
const cacheTimeLong = 1000 * 60 * 60 * 24 * 30;
const cacheForceRefresh = 1000 * 60 * 60 * 24 * 60;
const page404 = '/404.html';

//array of folders and files to cache for a longer time (cacheTimeLong)
const longCache = [
	'/assets/css',
	'/assets/fontawesome',
	'/assets/images',
	'/assets/js',
	'/public'
];

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
	fetch(page404 + '?v=1.0.1').then(res => {
		if (res.ok) caches.open('cache').then(cache => cache.put(page404, res.clone()));
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
								if (res.url == page404) return; //do not delete 404.html!

								//now the cache is really too old! Force delete it
								const date = new Date(res.headers.get('date'))
								if (Date.now() >= date.getTime() + cacheForceRefresh) cache.delete(res.url);
							});
						}),
					),
				),
			);
			break;
		case 'download_count':
			checkCache(event.data.request, cacheTimeShort).then(cache => {
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
		let cacheTime = cacheTimeShort;

		//switch to long cache if the case
		for (entry of longCache) {
			if (event.request.url.startsWith(this.origin + entry)) {
				cacheTime = cacheTimeLong;
				break;
			}
		}

		//check if the content is in cache
		const res = await checkCache(event.request.url, cacheTime);

		//return the cache immediately if existent and update the content async if expired
		if (res.cache != null) {
			if (res.expired) {
				fetch(event.request).then(res => {
					if (res.ok) { //if the response is 2xx then we can proceed and cache the page
						caches.open('cache').then(cache => {
							cache.put(event.request.url, res.clone());
						});
					}
				});
			}

			return res.cache;
		}

		//seems we have no cache available, fetch it live
		try {
			let res = await fetch(event.request);

			if (res.ok) { //if the response is 2xx then we can proceed and cache the page
				const cache = await caches.open('cache');
				cache.put(event.request.url, res.clone());
			}

			return res; //in any case, return the response
		}
		catch (error) { /* ignored */ }

		//all went wrong. return 404
		let c404 = await checkCache(page404);
		if (c404.cache != null) return c404.cache;

		//oh well did you reach there? You must have messed up with the cache then
	}());
});

//convenient method to check for match of given URL in cache
async function checkCache(url, time) {
	if (time === undefined) time = cacheTimeShort;

	const cache = await caches.open('cache');
	const cached = await cache.match(url);

	if (url == page404) //never delete 404!
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