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

	//send a message to purge the cache. Note that this wil not work on first install but it is fine
	navigator.serviceWorker.ready.then(registration => {
		registration.active.postMessage('purge');
	});
}

//show page as soon as possible
navigationContainer = document.getElementById('navigation');
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

//update copyright (well done maestro!)
document.getElementById('year').innerText = new Date().getFullYear();

//stop JavaScript-based animations in various places
const mediaQuery = matchMedia('(prefers-reduced-motion: reduce)');
window.reduceanimation = mediaQuery.matches;
mediaQuery.addEventListener('change', () => window.reduceanimation = mediaQuery.matches);

//create cookieconsent object and show it to the user if necessary
window.cc = initCookieConsent();

//configure the plugin
cc.run({
	autorun: false,
	current_lang: 'en', //defined languages
	auto_language: 'document', //language to display if available
	page_scripts: true, //block scripts until confirm
	autoclear_cookies: true, //clear cookies when changing prefs
	force_consent: true, //must consent on first visit before anything else
	gui_options: {
		consent_modal: { //consent layout
			layout: 'cloud',
			position: 'middle center',
			transition: 'zoom',
		},
		settings_modal: { //settngs layout
			layout: 'box',
			transition: 'zoom'
		}
	},
	onChange: (cookie, changed_preferences) => {
		// If analytics category is disabled => disable google analytics https://github.com/orestbida/cookieconsent/issues/249#issuecomment-1048675791
		togglegtag(cc.allowedCategory('analytics'));
	},

	languages: { //define language(s)
		'en': {
			consent_modal: { //main modal title, description, buttons
				title: strings.en.cookiemodaltitle,
				description: strings.en.cookiemodaldesc + ' <button type="button" data-cc="c-settings" class="cc-link">' + strings.en.cookiemodalbtn + '</button>',
				primary_btn: {
					text: strings.en.acceptall,
					role: 'accept_all'
				},
				secondary_btn: {
					text: strings.en.rejectall,
					role: 'accept_necessary'
				}
			},
			settings_modal: { //more settings modal
				title: strings.en.cookiesettingstitle,
				save_settings_btn: strings.en.savesettings,
				accept_all_btn: strings.en.acceptall,
				reject_all_btn: strings.en.rejectall,
				close_btn_label: strings.en.close,
				cookie_table_headers: [
					{ col1: strings.en.name },
					{ col2: strings.en.domain },
					{ col3: strings.en.expiration },
					{ col4: strings.en.description }
				],
				blocks: [ //the expandable blocks that contains singular elements that can be enabled or disabled
					{
						title: strings.en.cookiesettingsheader,
						description: strings.en.cookiesettingsdesc
					}, {
						title: strings.en.cookiesettings_blockstricttitle,
						description: strings.en.cookiesettings_blockstrictdesc,
						toggle: {
							value: 'necessary',
							enabled: true,
							readonly: true
						}
					}, {
						title: strings.en.cookiesettings_blockanalyticstitle,
						description: strings.en.cookiesettings_blockanalyticsdesc,
						toggle: {
							value: 'analytics',
							enabled: true,
							readonly: false
						},
						cookie_table: [
							{
								col1: '^_ga', //col1 must match the cookie name for correct handling of auto deletion!
								col2: 'google.com',
								col3: '2 ' + strings.en.years,
								col4: strings.en.cookiesettings_blockanalyticsgacookiedesc,
								is_regex: true
							},
							{
								col1: '_gid',
								col2: 'google.com',
								col3: '1 ' + strings.en.day,
								col4: strings.en.cookiesettings_blockanalyticsgidcookiedesc,
							}
						]
					}, {
						title: strings.en.moreinfo,
						description: strings.en.cookiesettingsmoreinfo + ' <a href="/privacy_policy/website.html" class="cc-link" onclick="cc.hideSettings(); cc.hide();">' + strings.en.privacypolicy + '</a>.',
					}
				]
			}
		}
	}
});

//apply the correct light/dark theme to cookieconsent and iOS splash screen (+ generate it)
ccColorScheme(matchMedia("(prefers-color-scheme: dark)").matches);
buildiOSSplash(matchMedia("(prefers-color-scheme: dark)").matches);

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", e => {
	ccColorScheme(e.matches);
	buildiOSSplash(e.matches);
});

//show cookieconsent if needed only outside of privacy policy page
ccShowHideDinamic();

//for Analytics
window.dataLayer = window.dataLayer || [];
togglegtag(cc.allowedCategory('analytics'));

//global 'esc' handler
onkeydown = e => {
	if (e.key === "Escape") {
		closeAllPopups();
		e.preventDefault(); //prevent the user from terminate the navigation with 'esc' (still possible from browser UI)
	}
}

//register scrollingHeader as the on scroll function
onscroll = scrollingHeader;

//store coordinates mainly for circle navigate animation
onclick = e => {
	if (e.pointerType == '') { //if this is a kwyboard click we set the pointer origin to the middle of the element
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
					|| !window.htmlClasses.includes('show--settings') && currentClasses.includes('show--settings')) {
					if (isStandalone())
						navigation.navigate('', { history: 'push', state: { handle: NAVIGATION_POPUP } });
				}
				else if (window.htmlClasses.includes('swal2-shown') && !currentClasses.includes('swal2-shown') ||
					window.htmlClasses.includes('show--settings') && !currentClasses.includes('show--settings')) { //a popup is being closed
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

					closeAllPopups();
					scrollTo({
						top: //distance of the target element + scrolling position - navbar shrinked height - 20 (so it's not sticky at the top)
							target.getBoundingClientRect().top +
							window.scrollY - breadcumb.offsetHeight -
							20,
					});
				}

				return;
			}
		}

		//if it is the same page...
		if (oldURL.href == newURL.href) {
			//... prevent going into dummy states with traverse if it is the case (even if not in PWA)...
			if (navigateEvent.destination.getState() !== undefined && navigateEvent.destination.getState().handle == NAVIGATION_POPUP && navigationType == 'traverse')
				navigateEvent.preventDefault();
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
						response = await fetch('/notfound.html'); //this is cached when the worker is installed, always present
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

			//extract arrow from new page to determine if it should be visible or not
			slideArrow(!newPageContent.querySelector('[data-insert-navigation="true"]'));

			//replace the main content
			newPageContent.getElementById('navigation').classList.add('ready');
			navigationContainer.innerHTML = newPageContent.getElementById('navigation').innerHTML;

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
					navigationContainer.style = '';
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
 * Correctly apply cookieconsent dark/light theme
 * @param {boolean} dark we are in dark mode
 */
function ccColorScheme(dark) { dark ? document.body.classList.add('c_darkmode') : document.body.classList.remove('c_darkmode'); }

/**
* Generate and attach iOS Splash screen
* thanks to https://github.com/avadhesh18/iosPWASplash !
* see also https://github.com/elegantapp/pwa-asset-generator/issues/93 (could things just work?)
* @param {boolean} dark we are in dark mode
*/
function buildiOSSplash(dark) {
	document.head.querySelectorAll('[rel=apple-touch-startup-image]').forEach(elem => elem.remove()); //remove existing splashscreens

	const color = getComputedStyle(document.body).getPropertyValue('--background'); //load the color value from css
	const icon = dark ? 'avatar-dark.png' : 'avatar.png';

	iosPWASplash('/assets/images/' + icon, color); //generate new ones
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
		showClass: {
			backdrop: 'fadein',
			popup: 'zoomin'
		},
		hideClass: {
			backdrop: 'fadeout',
			popup: 'zoomout'
		}
	});

	//close the popup on link click
	swal.getHtmlContainer().querySelectorAll('a').forEach(e => {
		e.addEventListener('click', () => swal.close());
	})
}

/**
 * Closes all the popups (except the cookie one if not accepted)
 */
function closeAllPopups() {
	swal.close();
	cc.hideSettings();
}

/**
 * Check if any popup is open in the page
 * @returns {Boolean}
 */
function isAnyPopupOpen() {
	return document.documentElement.classList.contains('show--settings') || swal.isVisible();
}

/**
 * Shows the cc popup only if outside of the privacy policy page and only if needed
 */
function ccShowHideDinamic() {
	if (location.pathname !== '/privacy_policy/website.html' && !cc.validConsent())
		cc.show();
	else if (location.pathname === '/privacy_policy/website.html' || cc.validConsent())
		cc.hide();
}

/********************************************************************************
********************************* Misc functions ********************************
/********************************************************************************/

//Analytics as provided by google
function gtag() { dataLayer.push(arguments); }

//Analytics as provided by Google
function togglegtag(enable) {
	if (enable) {
		gtag('js', new Date());
		gtag('config', 'G-H8RP322KHJ');
	} else
		gtag('consent', 'update', { 'analytics_storage': 'denied' });
}

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
 * For future reference there is a bug that appears like a feature: if you open the app on Android following these exact steps ->
 * 1. Open the browser and navigate to a page != home
 * 2. Launch the app from the overflow menu
 * When you go back the app will close, returning to the browser (and not the website home). However injectHome is executed and indeed if you
 * click the home icon everything works fine. I did extensive testing and research on this and it appears to be a nifty bug, because simply
 * interacting with the page (but not scrolling!) restores the correct behavior.
 * Anyway after this digression, I will keep it like that because almost all Android native apps behave the same way.
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