//constants
const SCROLL_UNSET = 0;
const SCROLL_SHRINKED = 1;
const NAVIGATION_UNSET = 0;
const NAVIGATION_FORCE_PUSH = 1;
const NAVIGATION_HOME_ADD = 2;
const NAVIGATION_POPUP = '_popup_handle';

if ('serviceWorker' in navigator) {
	//register the worker for PWA
	navigator.serviceWorker.register('/worker.js').catch(err => console.warn('Error whilst registering service worker', err));

	//send a message to purge the cache. Note that this will not work on first install but it is fine
	navigator.serviceWorker.ready.then(registration => {
		registration.active.postMessage({ 'command': 'purge' });
	});
}

//show page as soon as possible
navigationContainer = document.getElementById('navigation_container');
navigationContainer.classList.add('ready');

//set global variables (be careful! only of elements that will not be replaced!)
window.header = document.querySelector('header');
window.loadingPlaceholder = document.querySelector('[data-type="loading-placeholder"]');
window.breadcumb = document.getElementById('breadcumb');
window.navTitleText = document.querySelector('[data-type="title"]');
window.navTitleContainer = document.getElementById('title-container');
window.breadcumbArrow = document.body.querySelector('[data-insert-navigation]');
window.rootURL = new URL(location.origin);

//prevent the browser from restoring the previous scroll position when navigating (unvalid with Navigate API, see below the oher method used there)
if (history.scrollRestoration) history.scrollRestoration = "manual";

//init header background if the page was not at the top
scrollingHeader(true);

//init arrow (only needed to set the correct tabindex)
slideArrow(breadcumbArrow.getAttribute('data-insert-navigation') !== 'true');

//initialize (and register for changes) for the theme element
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());

//add load-complete class for images after they have loaded
lazyImgListener();

//init badges if needed
initDownloadBadges();

//update copyright (well done maestro!)
let footerCC = document.getElementById('year');
if (footerCC != null) footerCC.innerText = new Date().getFullYear();

//stop JavaScript-based animations in various places
const mediaQuery = matchMedia('(prefers-reduced-motion: reduce)');
window.reduceanimation = mediaQuery.matches;
mediaQuery.addEventListener('change', () => window.reduceanimation = mediaQuery.matches);

//global 'esc' handler
onkeydown = e => {
	if (e.key === "Escape") {
		closeAllPopups();
		e.preventDefault(); //prevent the user from terminate the navigation with 'esc' (still possible from browser UI)
	}
}

//PWA: prevent the user from scrolling the page when the touch begin in header/bottom bar + disable contextual menu and dragging
window.header.ontouchmove = ondragstart = oncontextmenu = e => {
	if (isStandalone()) e.preventDefault();
}

//register scrollingHeader as the on scroll function
onscroll = scrollingHeader;

//store coordinates mainly for circle navigate animation
onclick = e => {
	if (e.pointerType == '') { //if this is a keyboard click we set the pointer origin to the middle of the element
		rect = e.target.getBoundingClientRect();
		window.cx = rect.x + (rect.width / 2);
		window.cy = rect.y + (rect.height / 2);
	}
	else { //save the origin if there is one
		window.cx = e.x;
		window.cy = e.y;
	}
}

//stop animation while resizing for a better experience
window.resizeTimer;
onresize = () => {
	document.body.classList.add("noanim-all");
	clearTimeout(window.resizeTimer);
	window.resizeTimer = setTimeout(() => {
		document.body.classList.remove("noanim-all");
	}, 100);
};

//init cookieconsent
cc_init(ccShowHideDinamic);

//custom navigation handling (transitions and errors)
if ('navigation' in window) {
	window.alterNavigation = NAVIGATION_UNSET; //for PWA home navigation/injection. See below
	window.loadProcessing = false;
	navigation.updateCurrentEntry({ state: { title: document.title } }); //save the page title in the state for later use
	injectHomepage().then(index => currentIndex = index); //save initial navigation index

	//listen for configuration changes so that we inject home page when the user switch to PWA from defalt browser view (desktops)
	matchMedia('(display-mode: standalone)').addEventListener('change', async evt => {
		if (evt.matches) window.currentIndex = await injectHomepage();
	});

	//observe changes in html classes. Needed to handle popup navigation in standalone mode
	window.htmlClasses = document.documentElement.classList.toString();
	const observer = new MutationObserver(mutations => {
		mutations.forEach(mutation => {
			const currentClasses = mutation.target.classList.toString();

			if (window.htmlClasses != currentClasses) { //a popup is being shown
				if (!window.htmlClasses.includes('swal2-shown') && currentClasses.includes('swal2-shown')
					|| !window.htmlClasses.includes('show--preferences') && currentClasses.includes('show--preferences')) {
					if (isStandalone())
						navigation.navigate('', { history: 'push', state: { handle: NAVIGATION_POPUP } });
				}
				else if (window.htmlClasses.includes('swal2-shown') && !currentClasses.includes('swal2-shown') ||
					window.htmlClasses.includes('show--preferences') && !currentClasses.includes('show--preferences')) { //a popup is being closed
					//only if this is a dummy state execute the hook
					if (isStandalone() && navigation.currentEntry.getState() !== undefined && navigation.currentEntry.getState().handle == NAVIGATION_POPUP)
						//settimeout needed to correctly handle navigate event combined with popup close
						setTimeout(() => {
							if (window.alterNavigation !== NAVIGATION_UNSET)
								return;

							navigation.back()
						}, 0);
				}

				window.htmlClasses = currentClasses;
			}
		});
	});

	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['class'],
		childList: false,
		characterData: false
	});

	//register main listener
	navigation.addEventListener('navigate', navigateEvent => {
		//0: the home page is missing while in PWA (i.e. the app launched directly to an URL)
		if (alterNavigation === NAVIGATION_HOME_ADD) {
			navigateEvent.intercept({
				scroll: 'manual',
				async handler() {
					document.title = navigation.currentEntry.getState().title; //the only thing to do here is update the tab/history entry name using the provided state
				}
			});
			return;
		}

		let newPageContent;
		let animationTarget;
		let animated = false;
		let newIndex = navigateEvent.destination.index;
		let newURL = new URL(navigateEvent.destination.url);
		const newHash = newURL.href.split('#')[1];
		const oldURL = new URL(navigation.currentEntry.url);
		const oldHash = oldURL.href.split('#')[1];
		let navigationType = navigateEvent.navigationType;

		//force type to be 'push' even for replace when needed
		if (window.alterNavigation == NAVIGATION_FORCE_PUSH)
			navigationType = 'push';

		//this page is not in history, create the new index manually
		if (newIndex == -1)
			newIndex = window.currentIndex + 1;

		//if any popup is open and you are requesting to navigate backwards, then close it and stop here. This tries to emulate back button in Android apps to close things
		if (navigationType == 'traverse' && window.currentIndex >= newIndex && isAnyPopupOpen()) {
			//when not standalone, no states are pushed and we only provide a semi-functional way to close popups
			navigateEvent.preventDefault();
			closeAllPopups();
			return;
		}

		//when navigating away from a popup in PWA we must overwrite the current history entry so that the forward button will continue to work
		if (isStandalone() && window.alterNavigation == NAVIGATION_UNSET && navigation.currentEntry.getState() !== undefined &&
			navigation.currentEntry.getState().handle == NAVIGATION_POPUP && navigationType == 'push') {
			navigateEvent.preventDefault();
			window.alterNavigation = NAVIGATION_FORCE_PUSH;
			navigation.navigate(navigateEvent.destination.url, { history: 'replace' });
			return;
		}

		//if is anchor, animate (if not prevented by reduced-animation) and return
		if (navigateEvent.destination.sameDocument) {
			//stop if we are navigating to the same hash
			if (oldURL == newURL && oldHash === newHash)
				return;

			//handle hash if there
			if (newHash) {
				const target = document.getElementById(newHash);

				if (target != undefined) {
					navigateEvent.preventDefault();
					scrollToAnchor(target);
				}

				return;
			}
		}

		//if it is the same page...
		if (oldURL.href == newURL.href) {
			if (navigateEvent.destination.getState() !== undefined && navigateEvent.destination.getState().handle == NAVIGATION_POPUP && navigationType == 'traverse')
				//... prevent going into dummy states with traverse if it is the case (even if not in PWA)...
				navigateEvent.preventDefault();
			else if (navigation.currentEntry.getState() !== undefined && navigation.currentEntry.getState().handle == NAVIGATION_POPUP && isAnyPopupOpen()) {
				//... close any open popups if push-ing away from it (see also mutationobserver above) ...
				navigateEvent.preventDefault();
				closeAllPopups();
			}
			else //... or do nothing but accept the new pushed state
				navigateEvent.intercept({ scroll: 'manual' });

			return;
		}

		//if we are inside a PWA and we navigate back to the home page provide a better user experience by making it a real home page (back will close the app)
		if (isStandalone() && window.alterNavigation == NAVIGATION_UNSET && newURL.href == rootURL.href && newIndex > 0) {
			navigateEvent.preventDefault();

			if (navigationType == 'push') //force push on next iteration
				window.alterNavigation = NAVIGATION_FORCE_PUSH;

			navigation.traverseTo(navigation.entries()[0].key);
			return;
		}

		//complying to the reduced animation policy is easy as letting the browser handle everything starting from there. Moreover these navigation types are not handled, so we let the broswer do it's default with them
		if (window.reduceanimation || (navigationType != 'traverse' && navigationType != 'push'))
			return;

		//circle animation originating from the link click...
		if (navigationType == 'push') {
			const id = 'circle-reveal';

			//this is impossible, but anyway: if the user clicks fast enough one link and then another the page may become stuck because of the transitionend not triggering.
			//this prevents the behavior by bypassing the result if already animated
			if (document.getElementById(id))
				animated = true;
			else { //... or normally this happens
				animationTarget = document.createElement('div');
				animationTarget.id = id;

				let rightWidth = window.innerWidth - window.cx;
				let bottomHeight = window.innerHeight - window.cy;
				let factorX = window.cx > rightWidth ? window.cx * 2 : rightWidth * 2;
				let factorY = window.cy > bottomHeight ? window.cy * 2 : bottomHeight * 2;
				let factorS = Math.sqrt(factorX ** 2 + factorY ** 2); //calculate pixel perfect circle!

				document.body.appendChild(animationTarget);
				animationTarget.offsetWidth; //trigger reflow (workaround for no transition)
				animationTarget.style = 'opacity: 1; left: ' + window.cx + 'px; top: ' + window.cy + 'px; transform: scale(' + factorS + ');';
			}
		}
		//...or sliding animation for back/forward
		else if (navigationType == 'traverse') {
			animationTarget = navigationContainer;
			animationTarget.classList.remove('inverse');

			if (window.currentIndex < newIndex) { //FORWARD
				//if the user navigate fast enough between pages the website may become stuck because of the transitionend not triggering.
				//this prevents the behavior by bypassing the result if already animated
				if (animationTarget.classList.contains('navigate-forward'))
					animated = true;
				else {
					animationTarget.classList.remove('navigate-back');
					animationTarget.classList.add('navigate-forward');
				}
			} else { //BACK 
				if (animationTarget.classList.contains('navigate-back'))
					animated = true;
				else {
					animationTarget.classList.remove('navigate-forward');
					animationTarget.classList.add('navigate-back');
				}
			}
		}

		//hide any open popup (even if the navigation can still fail for any reason)
		closeAllPopups();

		window.loadProcessing = false; //reset loadPage processing state
		window.currentIndex = newIndex; //always update current index

		//animate navbar title to "Loading..." while keeping a min-width to avoid overflow clipping
		let placeholderWidth = loadingPlaceholder.getBoundingClientRect().width;
		navTitleText.style = 'min-width: ' + placeholderWidth + 'px;';
		navTitleContainer.classList.add('loading');

		//emulate a scrolling to the top on the navbar (this is fake! the page is stuck to make a better animation)
		window.header.classList.remove('shrinked');

		//animate the main loading view. This must be kept synced on the longer animation (currently the circle/slide)
		animationTarget.addEventListener('transitionend', () => {
			if (window.loadProcessing) //do not continue if loadPage is already processing the request or we will overwrite something!
				return;

			if (navigationType == 'push') {
				navigationContainer.classList.add('pagefixed');
				navigationContainer.style = 'margin-top: -' + window.scrollY + 'px;';
				animationTarget.classList.add('blink');
			}
			else if (navigationType == 'traverse')
				document.body.classList.add('pagefixed', 'blink');

			animated = true;
			loadPage();
		}, { once: true });

		//here we load the new content
		navigateEvent.intercept({
			scroll: 'manual',
			async handler() {
				//head title must be replaced here to not mess up history entries
				document.title = strings.en.loading;
				let response;

				try { //try to load the page...
					response = await fetch(newURL, { signal: navigateEvent.signal });

					if (!response.ok) //throw error in case of server errors (Promise errors goes directly to the catch below)
						throw new Error();
				}
				catch (e) { //or catch the error if something fail, giving back an error page
					//this prevents loading the error page in the middle of a navigation if the user navigate fast back/forward.
					//as the side effect of completely blocking the page if the user abort the loading with the browser button, but I see this as intended behavior so it's fine
					if (navigateEvent.signal.aborted)
						return;
					else
						response = await fetch('/404.html'); //this is cached when the worker is installed, always present
				}

				newPageContent = new DOMParser().parseFromString(await response.text(), "text/html");
				loadPage();
			}
		});

		//renders the page given the content is fully loaded
		function loadPage() {
			//the DOM is not ready. We don't know anything yet and we can't continue
			if (newPageContent == null)
				return;

			//even though the DOM is ready we must wait for the animation to complete to continue further
			if (!animated)
				return;

			//loadPage is already processing this request. Prevent multiple calls
			if (window.loadProcessing)
				return;

			window.loadProcessing = true;

			//remove any highlight to the text
			window.getSelection().removeAllRanges()

			//extract arrow from new page to determine if it should be visible or not
			slideArrow(!newPageContent.querySelector('[data-insert-navigation="true"]'));

			//replace the main content
			newPageContent.getElementById('navigation_container').classList.add('ready');
			navigationContainer.innerHTML = newPageContent.getElementById('navigation_container').innerHTML;
			navigationContainer.style = '';

			//find any script in the new page then save and remove it to load it correctly after
			var newScripts = [];
			navigationContainer.querySelectorAll('script').forEach(elem => {
				newScripts.push(elem);
				elem.remove();
			});

			//finally inject back the scripts so that they will be loaded correctly
			newScripts.forEach(js => {
				var script = document.createElement("script"); //create a new element
				Array.from(js.attributes).forEach(attr => script.setAttribute(attr.nodeName, attr.nodeValue)); //copy back all attributes
				if (!js.src) script.text = js.text; //copy innerText only if the script is inline
				navigationContainer.appendChild(script); //append the child back and load it
			});

			//execute image load handler
			lazyImgListener();

			//init badges if needed
			initDownloadBadges();

			//scroll to the top while it's hidden to allow the animation to look more natural (in addition to scroll: manual in intercept)
			scrollTo({
				top: 0,
				behavior: "instant"
			});

			if (navigationType == 'push') { //if push navigation: fade the circle out and then remove it
				animationTarget.classList.add('fadeout');

				animationTarget.addEventListener('transitionend', () => {
					animationTarget.remove();
					navigationContainer.classList.remove('pagefixed');
				}, { once: true });
			} else if (navigationType == 'traverse') { //if forward/back navigation: slide in new page
				document.body.classList.remove('blink');
				animationTarget.classList.add('inverse', 'noanim');

				//artificial delay to prevent issues with 'slow 3g' mode in Chrome. Don't think this applies to real life scenario, anyway it doesn'm atter too much
				setTimeout(() => animationTarget.classList.remove('noanim', 'navigate-back', 'navigate-forward', 'inverse'), 20);

				animationTarget.addEventListener('transitionend', () => {
					document.body.classList.remove('pagefixed');
				}, { once: true });
			}

			//replace the title in navbar and animate it back into view + replace head title + save the state in history
			navTitleText.innerHTML = newPageContent.querySelector('[data-type="title"]').innerHTML;
			document.title = newPageContent.title;
			navigation.updateCurrentEntry({ state: { title: document.title } });

			navTitleContainer.addEventListener('transitionend', () => {
				navTitleText.style = '';
			}, { once: true });

			navTitleContainer.classList.remove('loading');

			ccShowHideDinamic();

			window.alterNavigation = NAVIGATION_UNSET; //reset after the handling is complete
		}
	});
} else {
	//basic only implementation of important methods for browsers incompatible with Navigation API

	//smooth scroll to anchor with correct padding
	window.addEventListener('click', event => {
		if (!event.target.hash) return;

		event.preventDefault();
		scrollToAnchor(document.querySelector(event.target.hash));
	});
}

/********************************************************************************
********************************* UI functions **********************************
/********************************************************************************/

/**
 * Apply the theme on configuration change
 */
function applyTheme() {
	const color = getComputedStyle(document.body).getPropertyValue('--theme-color'); //load the color value from css
	let meta = document.querySelector('meta[name=theme-color]'); //find the element

	//or create one if not exist
	if (!meta) {
		meta = document.createElement('meta');
		meta.setAttribute('name', 'theme-color');
		meta.setAttribute('content', color);
		document.head.appendChild(meta);
	} else { //set the color if the element already exists
		meta.setAttribute('content', color);
	}
}

/**
 * Scroll to the given DOM element
 * @param {Element} target the target element
 */
function scrollToAnchor(target) {
	closeAllPopups();

	scrollTo({
		top: //distance of the target element + scrolling position - navbar shrinked height - 20 (so it's not sticky at the top)
			target.getBoundingClientRect().top +
			window.scrollY - breadcumb.offsetHeight -
			20,
	});
}

window.scrollingExec = SCROLL_UNSET;
/**
 * Move & resize header on scroll
 * @param {boolean} noanim do not animate the header on this call only
 */
function scrollingHeader(noanim = false) {
	if (typeof window.header === 'undefined') return;

	if (noanim === true) window.header.classList.add('noanim');

	if (window.scrollingExec != SCROLL_SHRINKED && document.documentElement.scrollTop > 35) {
		window.header.classList.add('shrinked'); //35px is good enough
		window.scrollingExec = SCROLL_SHRINKED;
	}
	else if (document.documentElement.scrollTop <= 35 && window.scrollingExec == SCROLL_SHRINKED) {
		window.header.classList.remove('shrinked');
		window.scrollingExec = SCROLL_UNSET;
	}

	if (noanim === true) window.header.classList.remove('noanim');
}

/**
 * Slide in/out the arrow gracefully based on the given input
 * @param {boolean} out 
 */
function slideArrow(out) {
	if (out) {
		if (window.breadcumbArrow.getAttribute('data-insert-navigation') === 'true')
			window.breadcumbArrow.setAttribute('data-insert-navigation', 'false');

		//this is out of the condition beacuse it may be needed on window load
		document.body.querySelector('[data-insert-navigation="false"]').setAttribute('tabindex', '-1');
	}
	else {
		if (window.breadcumbArrow.getAttribute('data-insert-navigation') !== 'true')
			window.breadcumbArrow.setAttribute('data-insert-navigation', 'true');

		//this is out of the condition beacuse it may be needed on window load
		document.body.querySelector('[data-insert-navigation="true"]').removeAttribute('tabindex');
	}
}

/**
* Generate and attach iOS Splash screen
* thanks to https://github.com/avadhesh18/iosPWASplash !
* see also https://github.com/elegantapp/pwa-asset-generator/issues/93 (could things just work?)
* @param {boolean} dark we are in dark mode
*/
function buildiOSSplash(dark) {
	document.head.querySelectorAll('[rel=apple-touch-startup-image]').forEach(elem => elem.remove()); //remove existing splashscreens

	const color = getComputedStyle(document.body).getPropertyValue('--background'); //load the color value from css
	const icon = dark ? 'avatar-dark.svg' : 'avatar.svg'; //TODO If ever restored try that everything works with svg

	iosPWASplash('/assets/images/' + icon, color); //generate new ones
}

/**
* Listen for lazy images load (or search existing ones) and add the correct class when fully loaded
*/
function lazyImgListener() {
	document.querySelectorAll('img.lazy-img').forEach(elem => {
		if (elem.complete)
			elem.classList.add('lazy-complete');
		else
			elem.addEventListener('load', event => {
				event.target.classList.add('lazy-complete');
				removeEventListener('load', this);
			});
	});
}

/********************************************************************************
******************************** Popup functions ********************************
/********************************************************************************/

/**
 * Open a popup with Swal by giving a valid js object with details for the needed sections (limited to this for now)
 * @param {Array} details must contain the following fields: [title, html, showConfirmButton]
 */
function openPopup(details) {
	Swal.fire({
		title: details.title,
		html: details.html,
		showConfirmButton: details.showConfirmButton,
		returnFocus: false,
		showCloseButton: true,
		showClass: {
			backdrop: 'fadein',
			popup: 'slidein'
		},
		hideClass: {
			backdrop: 'fadeout',
			popup: 'slideout'
		},
		customClass: {
			container: 'cclike-container',
			popup: 'cclike-popup',
			title: 'cclike-title',
			closeButton: 'cclike-closebutton',
			htmlContainer: 'cclike-htmlcontainer',
			actions: 'cclike-actions',
			confirmButton: 'cclike-confirmbutton',
			denyButton: 'cclike-denymbutton',
			cancelButton: 'cclike-cancelmbutton'
		},
		didOpen: popup => popup.focus()
	});
}

/**
 * Closes all the popups (except the cookie one if not accepted)
 */
function closeAllPopups() {
	swal.close();
	CookieConsent.hidePreferences();
}

/**
 * Check if any popup is open in the page
 * @returns {Boolean}
 */
function isAnyPopupOpen() {
	return document.documentElement.classList.contains('show--preferences') || swal.isVisible();
}

/**
 * Shows the cc popup only if outside of the privacy policy page and only if needed
 */
function ccShowHideDinamic() {
	if (location.pathname !== '/privacy_policy/website.html' && !CookieConsent.validConsent())
		CookieConsent.show();
	else if (location.pathname === '/privacy_policy/website.html' || CookieConsent.validConsent()) {
		CookieConsent.hide();
		CookieConsent.hidePreferences();
	}
}

/********************************************************************************
********************************* Misc functions ********************************
/********************************************************************************/
/**
 * Check if the current window is running in standalone mode (read: is a PWA)
 * @returns {Boolean} true if the window is standalone, false otherwise
 */
function isStandalone() {
	return (navigator.standalone || matchMedia('(display-mode: standalone)').matches);
}

/**
 * Thanks spammers! See https://jumk.de/nospam/stopspam.html
 */
function linkTo_UnCryptMailto(s, newWindow = true) {
	var n = 0;
	var r = "";
	for (var i = 0; i < s.length; i++) {
		n = s.charCodeAt(i);
		if (n >= 8364)
			n = 128;
		r += String.fromCharCode(n - 1);
	}

	newWindow ? open(r) : location.href = r;
}

/**
 * Add the Home Page if missing as first history entry. This only executes whe the site is in "app" mode (standalone).
 * Used to simulate a real app experience, with the back button leading to the home page before exit
 * @returns {Promise} a promise containing the new index to be stored (always index + 1 if the homepage was added)
 */
async function injectHomepage() {
	let currentIndex = navigation.currentEntry.index; //retrieve current index

	if (rootURL.href != new URL(navigation.entries()[0].url).href && isStandalone()) { //execute only if first page is not home and we are in PWA
		try {
			window.alterNavigation = NAVIGATION_HOME_ADD; //set alterNavigation to stop navigate from triggering

			//save various things that will come handy later
			const entries = navigation.entries();
			let oldURL = entries[0].url;
			let oldTitle = entries[0].getState().title;
			let homeTitle = strings.en.titlenotloaded;

			//first fetch the home page mainly to retrieve the title (yeah it's a waste... but what can I do?)
			try {
				const res = await fetch(rootURL.href);
				if (!res.ok) //throw error in case of server errors (Promise errors goes directly to the catch below)
					throw new Error();

				const text = await res.text();
				homeTitle = new DOMParser().parseFromString(text, "text/html").title;
			} catch (e) { /* Nope something went wrong, a placeholder will be displayed instead of the real title, not a big issue */ }

			//begin the injection!
			for (let i = 0; i <= entries.length; i++) { //<= is right, we need one more for the injection
				//must save these variables to temp ones because it is necessary to retrieve the next before executing any navigation call
				let tempURL = oldURL;
				let tempTitle = oldTitle;

				if (i != 0 && i < entries.length) { //retrieve next URL and title in list (if not first or last iteration)
					oldURL = entries[i].url;
					oldTitle = entries[i].getState().title;
				} else if (i == 0) { //set URL and title to the home ones if first iteration
					tempURL = rootURL.href;
					tempTitle = homeTitle;
				}

				//first iteration (Home) or successive ones. Loop through the saved entries to recreate the entire history (minus the last entry, see below)
				if (i == 0 && i < entries.length) {
					const res = await navigation.traverseTo(entries[i].key);
					await res.committed.then(() => {
						navigation.navigate(tempURL, { history: 'replace', state: { title: tempTitle } });
					});
				}
				else //last iteration. We don't have any more room to replace, so push a new state with the last page
					await navigation.navigate(tempURL, { history: 'push', state: { title: tempTitle } });
			}

			//navigate back to the (new) original entry and reset alterNavigation. This make sure the user don't notice any change
			const res = await navigation.traverseTo(navigation.entries()[currentIndex + 1].key);
			await res.committed.then(() => {
				window.alterNavigation = NAVIGATION_UNSET; //reset alterNavigation after everything is finished
			});

			currentIndex++; //increment the index because we added a new page
		} catch (e) {
			window.alterNavigation = NAVIGATION_UNSET //reset alterNavigation if something goes wrong
		}
	}

	return currentIndex; //return currentIndex, whatever the result
}

/**
 * Init the download count badges on any page if set in html.
 * See also @initDownloadBadge()
 */
function initDownloadBadges() {
	document.querySelectorAll('.download-badge').forEach(elem => initDownloadBadge(elem));
}

/**
 * Sends a request to the service worker that itself sends a request to the web worker and then handle cache and everything.
 * 
 * BE CAREFUL! This only works if the client supports service workers because it totally relies on it.
 * 
 * @example
 * <span class="download-badge">
 * 		<i class="fas fa-arrow-alt-circle-down"></i>
 * 		<span class="download-count" data-item="optional|required" data-type="optional|required"></span>
 * </span>
 */
function initDownloadBadge(downloadBadge) {
	let textContainer = downloadBadge.children[1]; //as the structure is defined, we can rely on simple indexes
	let item = textContainer.getAttribute('data-item');
	let type = textContainer.getAttribute('data-type');
	let fresh = downloadBadge.classList.contains('load');

	if (item == null && type == null) return; //invalid data from html element

	if (!fresh) { //init counter on page load
		request(json => {
			textContainer.innerHTML = '';
			[...json.downloads_readable].forEach(digit => textContainer.innerHTML += '<span data-type="digit">' + digit + '</span>');
			downloadBadge.classList.add('load');

			if (json._cache_state == 'expired') initDownloadBadge(downloadBadge); //request a refresh for this counter if expired
		});
	} else { //request update and animate counter when the user "sees" the element
		new IntersectionObserver((entries, observer) => {
			if (!entries[0].isIntersecting) return; //we only have one entry (thus the [0]) + the callback is called on initialization so we should skip that

			observer.disconnect(); //disconnect as soon as possible

			//request data and animate
			request(json => {
				setTimeout(() => {
					//old counter digit and length
					let previousDigits = textContainer.childNodes;
					let previousCount = Object.keys(previousDigits).length;

					//new counter digit and length
					let newDigits = [...json.downloads_readable];
					let newCount = Object.keys(newDigits).length;

					//get the longer counter to iterate through
					let longer = newCount > previousCount ? newCount : previousCount;

					//loop over the longer counter (longer != highest)
					for (let i = 0; i < longer; ++i) {
						//get previous digit, if undefined then create a dummy element so that later we can insert the new one
						let previousDigit = previousDigits[i];
						if (previousDigit === undefined) {
							let dummy = document.createElement('span');
							dummy.innerHTML = '&nbsp;';
							dummy.setAttribute('data-type', 'digit');
							dummy.style = 'width: 0px';
							previousDigit = textContainer.appendChild(dummy);
						}

						let previousDigitValue = previousDigit.innerText;
						let newDigitValue = newDigits[i];

						if (previousDigitValue !== newDigitValue) {
							//inject new digit
							let innerHTML = '<span class="old">' + previousDigitValue + '</span>';
							if (newDigitValue !== undefined) innerHTML += '<span class="new">' + newDigitValue + '</span></span>';
							else innerHTML += '<span class="new"></span></span>';

							previousDigit.innerHTML = innerHTML;

							setTimeout(() => {
								let previousWidth = previousDigit.childNodes[0].getClientRects()[0].width; //0 is the 'old' span element
								previousDigit.style.width = `${previousWidth}px`; //temporarily fix old width so that it will animate later
								previousDigit.classList.add('replace'); //add 'replace' class that will animate the digit
								previousDigit.style = `width: ${previousDigit.childNodes[1].getClientRects()[0].width}px`; //set new width and animate
							}, 40 * i); //animate digits one after the other
						}
					}
				}, 250); //insert a little timeout to give time to better see the animation
			});
		}, { threshold: 1.0 }).observe(downloadBadge.parentElement); //observe on the card, not badge itself
	}

	//inner function to get data from worker
	function request(callback) {
		sendMessage({
			command: 'download_count',
			options: { "fresh": fresh },
			request: globals.optional_base_url + '/workers/download_count.php?'
				+ (item != null ? '&item=' + item : '')
				+ (type != null ? '&type=' + type : '')
		})
			.then(json => callback(json))
			.catch(error => { }); //ignored
	}
}

/**
 * Convenient method to send a message to the service worker and get back a response via a Promise.
 * See https://googlechrome.github.io/samples/service-worker/post-message/
 * @param {*} message	the command to send 
 * @returns {Promise}	a Promise that will resolve if the call completes successfully with the result, if any
 */
function sendMessage(message) {
	return new Promise((resolve, reject) => {
		navigator.serviceWorker.ready.then(registration => { //wait for register if this is first install
			var messageChannel = new MessageChannel();
			messageChannel.port1.onmessage = event => {
				if (event.data.error) reject(event.data.error);
				else resolve(event.data);
			};

			registration.active.postMessage(message, [messageChannel.port2]);
		});
	});
}