---
layout: post

title: The JS Navigate Event API
navtitle: Navigate!
description: "Alternative title: Click me to see the beautiful transition (Only Chrome M102+ currently)"
---

<div class="post-img">
<img src="/public/growtika-firefox.jpg" alt="Main superfluous image">
<p>Photo by <a target="_blank" href="https://unsplash.com/@growtika">Growtika</a></p>
</div>

During the creation of this site I faced many challenges regarding mainly the design/animation and what I should expect as a result.

The initial idea was to create a simple showcase of all of my creatures 🦖 that could be easily updated in case anything changed; while this is still the main point of the work, I found myself repeatly in situation like "Why didn't I add this animation?", "Oh, a blog seems like a good idea to share ideas with others, why not creating one?" or "Yeah, I should absolutely come up with a solution that allow me to save these two lines of code...".
With this spirit I could not accept an abrupt transition when navigating to other pages, so I begin implementing the (yet in proposal) [Navigate API](https://developer.chrome.com/docs/web-platform/navigation-api/){:target="_blank"}. While technically the [View Transition API](https://developer.chrome.com/docs/web-platform/view-transitions/){:target="_blank"} is more suitable for this kind of job, I found myself pretty comfortable using the aforementioned Navigate API for the same purpose.

Still don't know what I'm talking about? Let's start a shallow dive inside the beautiful word of this new API.
Managing page transition was not an easy task: you could choose between JS libraries to create [SPAs](https://en.wikipedia.org/wiki/Single-page_application){:target="_blank"}, come up with your own implementation or whatever, but all of these have some disadvantages, be it that you need to create tailored contents providers or the fact that you want to have real pages with real URLs that could also work as SPAs when needed. And here comes the [Navigate API](https://developer.chrome.com/docs/web-platform/navigation-api/){:target="_blank"}! In short, it allows you to catch all the navigation between pages and choose what to do then. Wow, that seemed pretty powerful too me!

I then started working on the implementation: We have to keep in mind the limited capabilities of the host (GitHub Pages), so no dynamic content at all, but other than this the road seems straight. Some statements to allow outside navigation and hash navigation and then we are at the hearth of the logic! The script take care of beautifully transitioning the current page to a loading state and while this is happening the new page is loaded in the background (if you look closely at the function you will notice that the entire new page is loaded and not only the necessary wasting precious data, but remember the limited capacity of the host). When the new page is loaded the content of the current page is replaced and transitioned back as soon as possible.

So what are the advantages? These are some:
1. Simple implementation on existing websites by only implementing the javascript client side script
2. Fail proof: If the browser doesn't support the API or an error happens, the navigation will continue normally like a standard website
3. Extremely customizable: You can catch any event related to navigation, like Refresh, Back/Forward, Link clicks and Anchor navigation and then do anything you want, like showing a login page or a paywall in the middle
4. You can call navigate programmatically, so when you change URL with another JS call (even with old methods like `location.assign()`) everything will still be managed by the same logic without doing strange quirks!

So all in all this seems a pretty powerful addition to the javascript capabilities, delivering much needed native methods to make your website feel even more like a native app on any device!

If you are interested, the full specifications is available [here](https://github.com/WICG/navigation-api){:target="_blank"}. Nice coding to all!
