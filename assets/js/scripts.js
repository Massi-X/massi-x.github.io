//TODO should i use restore scroll?

//register the worker for PWA
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/worker.js').catch(err => console.warn('Error whilst registering service worker', err));

//show page as soon as possible
navigationContainer = document.getElementById('navigation');
navigationContainer.classList.add('ready');

//set global variables (be careful! only of elements that will not be replaced!)
header = document.querySelector('header');
metaTitle = document.head.getElementsByTagName('title')[0];
loadingPlaceholder = document.querySelector('[data-type="loading-placeholder"]');
breadcumb = document.getElementById('breadcumb');
navTitleText = document.querySelector('[data-type="title"]');
navTitleContainer = document.getElementById('title-container');
breadcumbArrow = document.body.querySelector('[data-insert-navigation]');

//prevent the browser from restoring the previous scroll position when navigating (unvalid with Navigate API, see below the oher method used there)
if (history.scrollRestoration) history.scrollRestoration = "manual";

//init header background if the page was not at the top
scrollingHeader(true);

//init arrow (only needed to set the correct tabindex)
initSlideArrow(breadcumbArrow.getAttribute('data-insert-navigation') !== 'true');

//initialize (and register for changes) for the theme element
applyTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());

//update copyright (well done maestro!)
document.getElementById('year').innerText = new Date().getFullYear();

//stop JavaScript-based animations in various places
const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
window.reduceanimation = mediaQuery.matches;
mediaQuery.addEventListener('change', () => window.reduceanimation = mediaQuery.matches);

//create cookieconsent object and show it to the user if necessary
var cc = initCookieConsent();

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
	onChange: function (cookie, changed_preferences) {
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

//apply the correct light/dark theme to cookieconsent
ccColorScheme(matchMedia("(prefers-color-scheme: dark)").matches);
matchMedia("(prefers-color-scheme: dark)")
	.addEventListener("change", e => ccColorScheme(e.matches));

//show cookieconsent if needed only outside of privacy policy page
ccShowHideDinamic();

//for Analytics
window.dataLayer = window.dataLayer || [];
togglegtag(cc.allowedCategory('analytics'));

//register scrollingHeader as the on scroll function
window.onscroll = scrollingHeader;

//store coordinates mainly for circle navigate animation
window.onclick = e => {
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
window.onresize = () => {
	document.body.classList.add("noanim-all");
	clearTimeout(window.resizeTimer);
	window.resizeTimer = setTimeout(() => {
		document.body.classList.remove("noanim-all");
	}, 100);
};

//custom navigation handling (transitions and errors)
if ('navigation' in window) {
	//save initial navigation index
	window.currentIndex = navigation.currentEntry.index;

	//register listener
	navigation.addEventListener('navigate', navigateEvent => { //if page is not in domain is not considered a navigate event. One less problem
		//save old and new URL, will come useful later
		const oldURL = new URL(navigation.currentEntry.url);
		const newURL = new URL(navigateEvent.destination.url);

		//1: if is anchor, animate (if not prevented by reduced-animation) and return
		if (navigateEvent.destination.sameDocument) {
			let hash = navigateEvent.destination.url.split('#')[1];

			if (hash) { //we must make sure that this is an anchor link, if not it is probably case 2) below
				navigateEvent.preventDefault();

				window.scrollTo({
					top: //distance of the target element + scrolling position - navbar shrinked height - 20 (so it's not sticky at the top)
						document.getElementById(hash).getBoundingClientRect().top +
						window.scrollY - breadcumb.offsetHeight -
						20,
				});

				return;
			}
		}

		//2: if it is the same page, scroll to top and return
		if (oldURL.href == newURL.href) {
			navigateEvent.preventDefault();

			if (swal.isVisible()) //if a popup is visible and you close it the page will scroll up and down again. Do not do this, simply close it
				swal.close();
			else //if instead there is no popup scroll to the top
				window.scrollTo({
					top: 0
				});

			return;
		}

		//complying to the reduced animation policy is easy as letting the browser handle everything starting from there. Moreover these navigation types are not handled, so we let the broswer do it's default with them
		if (window.reduceanimation || navigateEvent.navigationType == 'reload' || navigateEvent.navigationType == 'replace')
			return;

		let newPageContent;
		let animationTarget;
		let animated = false;
		let newIndex = navigateEvent.destination.index;

		if (newIndex == -1) //this page is not in history, create the new index manually
			newIndex = currentIndex + 1;

		//3: circle animation originating from the link click
		if (navigateEvent.navigationType == 'push') {
			animationTarget = document.createElement('div');
			animationTarget.id = 'circle-reveal';

			let rightWidth = window.innerWidth - window.cx;
			let bottomHeight = window.innerHeight - window.cy;
			let factorX = window.cx > rightWidth ? window.cx * 2 : rightWidth * 2;
			let factorY = window.cy > bottomHeight ? window.cy * 2 : bottomHeight * 2;
			let factorS = Math.sqrt(factorX ** 2 + factorY ** 2); //calculate pixel perfect circle!

			document.body.appendChild(animationTarget);
			animationTarget.offsetWidth; //trigger reflow (workaround for no transition)
			animationTarget.style = 'left: ' + window.cx + 'px; top: ' + window.cy + 'px; transform: scale(' + factorS + ');';
		}
		//4: sliding animation for back/forward
		else if (navigateEvent.navigationType == 'traverse') {
			animationTarget = navigationContainer;
			navigationContainer.classList.remove('inverse', 'navigate-back', 'navigate-forward');

			if (currentIndex < newIndex) //FORWARD
				animationTarget.classList.add('navigate-forward');
			else { //BACK 
				//if cookieconsent is open stop there. This tries to emulate back button in Android apps to close things
				if (document.documentElement.classList.contains('show--settings')) {
					cc.hideSettings();
					navigateEvent.preventDefault();
					return;
				}

				//else...
				animationTarget.classList.add('navigate-back');
			}
		}

		//hide any open popup (even if the navigation can still fail for any reason)
		cc.hideSettings();
		swal.close();

		window.currentIndex = newIndex; //always update current index

		//animate navbar title to "Loading..." while keeping a min-width to avoid overflow clipping
		let placeholderWidth = loadingPlaceholder.getBoundingClientRect().width;
		navTitleText.style = 'min-width: ' + placeholderWidth + 'px;';
		navTitleContainer.classList.add('loading');

		//emulate a scrolling to the top on the navbar (this is fake! the page is stuck to make a better animation)
		header.classList.remove('shrinked');

		//animate the main loading view. This must be kept synced on the longer animation (currently the circle/slide)
		animationTarget.addEventListener('transitionend', () => {
			if (navigateEvent.navigationType == 'push') {
				navigationContainer.classList.add('pagefixed');
				navigationContainer.style = 'margin-top: -' + window.scrollY + 'px;';
				animationTarget.classList.add('blink');
			}
			else if (navigateEvent.navigationType == 'traverse')
				document.body.classList.add('pagefixed', 'blink');

			animated = true;
			loadPage();
		}, { once: true });

		//here we load the new content
		navigateEvent.intercept({
			scroll: 'manual',
			async handler() {
				//head title must be replaced here to not mess up history entries
				metaTitle.innerText = strings.en.loading;
				let response;

				try { //try to load the page...
					response = await fetch(newURL, { signal: navigateEvent.signal });
				}
				catch (e) { //or catch the error if something fail, giving back an error page
					response = await fetch('/notfound.html'); //this is cached when the worker is installed, always present
				}

				newPageContent = new DOMParser().parseFromString(await response.text(), "text/html");
				loadPage();
			},
		});

		function loadPage() {
			//the DOM is not ready. We don't know anything yet and we can't continue
			if (newPageContent == null)
				return;

			//extract arrow from new page to determine if it should be visible or not
			initSlideArrow(!newPageContent.querySelector('[data-insert-navigation="true"]'));

			//even though the DOM is ready we must wait for the animation to complete to continue further
			if (!animated)
				return;

			//replace the main content
			newPageContent.getElementById('navigation').classList.add('ready');
			navigationContainer.innerHTML = newPageContent.getElementById('navigation').innerHTML;

			//scroll to the top while it's hidden to allow the animation to look more natural (in addition to scroll: manual in intercept)
			window.scrollTo({
				top: 0,
				behavior: "instant"
			});

			if (navigateEvent.navigationType == 'push') { //if push navigation: fade the circle out and then remove it
				animationTarget.classList.add('fadeout');
				navigationContainer.classList.remove('pagefixed');
				navigationContainer.style = '';

				animationTarget.addEventListener('transitionend', () => {
					animationTarget.remove();
				}, { once: true });
			}
			else if (navigateEvent.navigationType == 'traverse') { //if forward/back navigation: slide in new page
				document.body.classList.remove('pagefixed', 'blink');
				animationTarget.classList.add('inverse', 'noanim');

				//artificial delay to prevent issues with 'slow 3g' mode in Chrome. Don't think this applies to real life scenario, anyway it doesn'm atter too much
				setTimeout(() => navigationContainer.classList.remove('noanim', 'navigate-back', 'navigate-forward', 'inverse'), 20);
			}

			//replace the title in navbar and animate it back into view + replace head title
			navTitleText.innerHTML = newPageContent.querySelector('[data-type="title"]').innerHTML;
			metaTitle.innerText = newPageContent.head.getElementsByTagName('title')[0].innerText;

			navTitleContainer.addEventListener('transitionend', () => {
				navTitleText.style = '';
			}, { once: true });

			navTitleContainer.classList.remove('loading');

			ccShowHideDinamic();
		}
	});
}

/********************************************************************************
*********************************** Functions ***********************************
/********************************************************************************/

/**
 * Shows the cc popup only if outside of the privacy policy page and only if needed
 */
function ccShowHideDinamic() {
	if (window.location.pathname !== '/privacy_policy/website.html' && !cc.validConsent())
		cc.show();
	else if (window.location.pathname === '/privacy_policy/website.html' || cc.validConsent())
		cc.hide();
}
/**
 * Correctly apply cookieconsent dark/light theme
 * @param {boolean} dark 
 */
function ccColorScheme(dark) { dark ? document.body.classList.add('c_darkmode') : document.body.classList.remove('c_darkmode'); }

//as provided by google
function gtag() { dataLayer.push(arguments); }

//Analytics as provided by Google
function togglegtag(enable) {
	if (enable) {
		gtag('js', new Date());
		gtag('config', 'G-H8RP322KHJ');
	} else {
		gtag('consent', 'update', {
			'analytics_storage': 'denied'
		});
	}
}

/**
 * Open a popup with Swal by giving a valid js object with details for the needed sections (limited to this for now)
 * @param {Array} details 
 */
function openPopup(details) {
	Swal.fire({
		title: details.title,
		html: details.html,
		showConfirmButton: details.showConfirmButton
	})
}

/**
 * Apply the theme on configuration change
 */
function applyTheme() {
	let color = getComputedStyle(document.body).getPropertyValue('--theme-color'); //load the color value from css
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
 * Move & resize header on scroll
 * @param {boolean} noanim 
 */
function scrollingHeader(noanim) {
	if (typeof header === 'undefined')
		return;

	if (typeof noanim == 'boolean' && noanim)
		header.classList.add('noanim');
	else
		header.classList.remove('noanim');

	if (document.documentElement.scrollTop > 35) //35px is good enough
		header.classList.add('shrinked');
	else
		header.classList.remove('shrinked');
}

/**
 * Slide in/out the arrow gracefully based on the given input
 * @param {boolean} out 
 */
function initSlideArrow(out) {
	if (out) {
		if (breadcumbArrow.getAttribute('data-insert-navigation') === 'true')
			breadcumbArrow.setAttribute('data-insert-navigation', 'false');

		//this is out of the condition beacuse it may be needed on window load
		document.body.querySelector('[data-insert-navigation="false"]').setAttribute('tabindex', '-1');
	}
	else {
		if (breadcumbArrow.getAttribute('data-insert-navigation') !== 'true')
			breadcumbArrow.setAttribute('data-insert-navigation', 'true');

		//this is out of the condition beacuse it may be needed on window load
		document.body.querySelector('[data-insert-navigation="true"]').removeAttribute('tabindex');
	}
}