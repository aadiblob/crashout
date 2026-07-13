# Crashout V2

A mobile-first, one-phone finger chooser that immediately gives the selected player an unhinged dare.

## V1 features

- Tracks 2–8 simultaneous fingers, limited by the phone's reported touch support
- White rings that become solid circles after each finger holds still
- Automatic random winner selection using `crypto.getRandomValues`
- 57 starter dares
- Avoids recently used prompts and immediate prompt-style repetition
- Installable Progressive Web App
- Offline support after the first load
- No accounts, ads, subscriptions, frameworks, or build step

## Run locally

Because the app uses a service worker, serve the folder instead of opening `index.html` directly.

With Python:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000` on a browser. Multi-touch should be tested on a real phone.

## Deploy with Cloudflare Pages

1. Create a new GitHub repository named `crashout`.
2. Upload all files in this folder to the repository root.
3. In Cloudflare, open **Workers & Pages** and create a Pages project.
4. Connect the `crashout` GitHub repository.
5. Choose **No framework**.
6. Leave the build command blank.
7. Set the output directory to `/` or leave it at the repository root.
8. Deploy.

Every push to the main GitHub branch will update the site.

## Add or edit dares

Open `prompts.js`. Each entry follows this format:

```js
{
  id: "dare-058",
  text: "Your new dare.",
  tags: ["phone", "group"]
}
```

The tags are invisible to players. They only help the randomizer avoid showing the same style repeatedly.

## Important mobile note

The code accepts up to eight touches, but the physical touchscreen and browser determine the true maximum. The app displays the device's reported `navigator.maxTouchPoints` value at the bottom of the screen.


## V2 changes

- Chooses a different gradient theme on each fresh app launch
- Includes eight gradient combinations
- Uses the supplied Crashout artwork for the app icon
- Accepts up to eight pointer events even when the browser reports a lower hardware limit
- Uses a network-first service worker so GitHub/Cloudflare updates appear more reliably

### Multi-touch hardware limitation

The JavaScript accepts up to eight touches. The physical phone digitizer and mobile browser
still determine how many contacts can actually be reported. A device that only emits five
touch contacts cannot be forced to emit a sixth through HTML or JavaScript.
