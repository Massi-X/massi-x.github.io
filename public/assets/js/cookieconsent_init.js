/**
 * Load the unified cc dialog containing standard information reusable on more subdomains.
 * You MUST preventively load the strings array separately (from public/assets/js/strings.js)
 * @param {*} show_func callable function that contains the logic to show the popup when needed (i.e. outside of the privacy policy page)
 * @returns null
 */

//configure cookieconsent
function cc_init(show_func) {
	if (typeof strings === 'undefined') {
		console.error('No strings object found! Please load the main string file separately.');
		return;
	}

	//dinamically load the cookie button description (mainly for subdomain where strings is only a js object)
	document.querySelector('a.cookie-settings>span').innerHTML = strings.en.managecookie;

	let domain = 'massi-x.dev';
	let cookie_ga = /^(_ga)/;
	let cookie_gid = '_gid';
	let privacy_link = '<a href="https://' + domain + '/privacy_policy/website.html" class="cc-link">' + strings.en.privacypolicy + '</a>';

	CookieConsent.run({ //FIXME transition bug https://github.com/orestbida/cookieconsent/issues/697
		autoShow: false,
		disablePageInteraction: true, //must consent on first visit before anything else

		cookie: {
			name: 'cc_pref',
			domain: domain,
			expiresAfterDays: acceptType => { return acceptType === 'all' ? 365 : 182; },
		},

		guiOptions: {
			consentModal: { //consent layout
				layout: 'cloud',
				position: 'middle center',
				equalWeightButtons: false
			},
			preferencesModal: { //settngs layout
				layout: 'box',
				equalWeightButtons: false
			}
		},

		categories: {
			necessary: {
				enabled: true,
				readOnly: true
			},

			analytics: {
				readOnly: false,
				autoClear: {
					cookies: [
						{
							name: cookie_ga,
							domain: domain
						},
						{
							name: cookie_gid,
							domain: domain
						}
					]
				}
			}
		},

		language: { //define language(s)
			default: 'en',
			autoDetect: 'document',
			translations: {
				en: {

					consentModal: { //main modal title, description, buttons
						title: strings.en.cookiemodaltitle,
						description: strings.en.cookiemodaldesc,
						acceptAllBtn: strings.en.acceptall,
						acceptNecessaryBtn: strings.en.rejectall,
						showPreferencesBtn: strings.en.cookiesettingstitle,
						footer: privacy_link
					},

					preferencesModal: { //more settings modal
						title: strings.en.cookiesettingstitle,
						savePreferencesBtn: strings.en.savesettings,
						acceptAllBtn: strings.en.acceptall,
						acceptNecessaryBtn: strings.en.rejectall,
						closeIconLabel: strings.en.close,
						sections: [ //the expandable blocks that contains singular elements that can be enabled or disabled
							{
								description: strings.en.cookiesettingsdesc
							}, {
								title: strings.en.cookiesettings_blockstricttitle + '<span class="pm__badge">' + strings.en.cookiesettings_blockstrictbadge + '</span>',
								description: strings.en.cookiesettings_blockstrictdesc,
								linkedCategory: 'necessary'
							}, {
								title: strings.en.cookiesettings_blockanalyticstitle,
								description: strings.en.cookiesettings_blockanalyticsdesc,
								linkedCategory: 'analytics',
								cookieTable: {
									headers: {
										name: strings.en.name,
										domain: strings.en.domain,
										description: strings.en.description,
										duration: strings.en.expiration
									},
									body: [
										{
											name: cookie_ga.source,
											domain: 'google.com',
											description: strings.en.cookiesettings_blockanalyticsgacookiedesc,
											duration: '2 ' + strings.en.years,
											is_regex: true
										},
										{
											name: cookie_gid,
											domain: 'google.com',
											description: strings.en.cookiesettings_blockanalyticsgidcookiedesc,
											duration: '1 ' + strings.en.day
										}]
								}
							}, {
								title: strings.en.moreinfo,
								description: strings.en.cookiesettingsmoreinfo + ' ' + privacy_link + '.',
							}
						]
					}
				}
			}
		},

		onChange: ({ cookie, changedCategories, changedServices }) => {
			// If analytics category is disabled => disable google analytics https://github.com/orestbida/cookieconsent/issues/249#issuecomment-1048675791
			togglegtag(CookieConsent.acceptedCategory('analytics'));
		},

		onModalReady: ({ modalName, modal }) => {
			//show cookieconsent if needed only outside of privacy policy page
			show_func();
		}
	});

	//apply the correct light/dark theme to cookieconsent and iOS splash screen (+ generate it)
	ccColorScheme(matchMedia("(prefers-color-scheme: dark)").matches);
	//buildiOSSplash(matchMedia("(prefers-color-scheme: dark)").matches); disabled because of https://github.com/elegantapp/pwa-asset-generator/issues/93

	matchMedia("(prefers-color-scheme: dark)").addEventListener("change", e => {
		ccColorScheme(e.matches);
		//buildiOSSplash(e.matches); disabled because of https://github.com/elegantapp/pwa-asset-generator/issues/93
	});

	/**
	 * Correctly apply cookieconsent dark/light theme
	 * @param {boolean} dark we are in dark mode
	 */
	function ccColorScheme(dark) { dark ? document.documentElement.classList.add('cc--darkmode') : document.documentElement.classList.remove('cc--darkmode'); }

	//Analytics as provided by google
	window.dataLayer = window.dataLayer || [];
	togglegtag(CookieConsent.acceptedCategory('analytics'));

	function gtag() { dataLayer.push(arguments); }

	//Analytics as provided by Google
	function togglegtag(enable) {
		if (enable) {
			gtag('consent', 'update', { 'analytics_storage': 'granted' });
			gtag('js', new Date());
			gtag('config', 'G-H8RP322KHJ');
		} else
			gtag('consent', 'update', { 'analytics_storage': 'denied' });
	}
}

