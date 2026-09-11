# The donation page

The page behind the **Crypto** button in every repository, served from this repo's `docs/` folder by
GitHub Pages. It lives here rather than in any one project, because it serves all of them and most
have no documentation to put it in.

It is **BombVault's own donation window, rebuilt in plain HTML** rather than a second design. Pick
the coin, then the network, and the QR code and address change in place.

## Why it is generated

`docs/index.html` is built from `template.html` and the list in `coins.mjs`. The reason is the QR
codes: a payment address is the one string on a page nobody can proofread, and a code drawn from
anything other than the address beside it is a mistake no reader can catch. Both come from the same
constant, so they cannot disagree.

```sh
node donate/build.mjs       # writes docs/index.html
node donate/check.mjs       # every QR, every chain, every tile
node donate/check-app.mjs   # compares the addresses with BombVault's own window
node donate/buttons/gen-buttons.mjs   # redraws the PayPal and Crypto buttons
```

`check.mjs` catches the three ways this page can be wrong, and only the first is catchable by eye:

1. **The address is wrong.** A reader can compare it to a wallet.
2. **The QR code does not encode the address printed beside it.** Nobody can see this. A phone reads
   the picture, not the characters, so the money goes elsewhere and the page still looks perfect.
3. **A chain points at an address that does not live on it.** This is the one that loses the money
   outright: the address is well-formed, the code matches it, and only the network is wrong.

Check 3 leans on `ADDRESS_BY_CHAIN` in `coins.mjs`, which is written out **by hand**. Derived from
the list it guards, it would agree with any mistake in it.

`coins.mjs` carries no side effects on purpose. If the data lived in `build.mjs`, importing it from
the checker would rebuild the page before the checker read it, and a hand-edit of the generated file
would be erased a moment before it was looked for.

All three checks run in CI on every push, and the workflow rebuilds the page first and demands that
`docs/index.html` came out unchanged.

## Coins first, chains underneath

A donor thinks *"I have USDT"*, not *"I have Ethereum"*, so the first choice is the one they can
actually answer. The second choice is the dangerous one and stays a real, separate choice: **every
network offered carries its own address**, so a chain that cannot receive is unofferable rather than
merely discouraged.

The chain row shows even for a coin with a single chain. It is the line that says *which* network
the address belongs to, and that fact may not appear and disappear depending on which tile is lit.

## The buttons live here too

`buttons/` holds the three images every repository's README shows: Buy Me a Coffee (the vendor's own
SVG), PayPal and Crypto. They are the same three files in every README, so a copy per repository
would mean dozens of images that have to be regenerated in lockstep. Every README points at
`raw.githubusercontent.com/junkerderprovinz/junkerderprovinz/main/donate/buttons/...` instead.

The PayPal and Crypto buttons wear their brand colours flat, which is the opposite of what the apps
do. In an app they are neutral and take the brand on hover. **A GitHub README cannot hover at all:**
the sanitiser strips `<style>` and script, an inline `style` carries no pseudo-classes, an SVG
embedded as `<img>` never sees the pointer, and `<picture>` inside `<a>` is broken by the same
sanitiser. A flat brand fill reads in both themes. This page is where the hover actually happens.

## Kept in step with the app

BombVault's own window carries the same addresses in `web/src/lib/donate.ts`. Two copies of a
payment address in two repositories is a real risk, and neither repo's own tests can close it,
because neither has the other's files. `check-app.mjs` closes it from this side: it fetches that
file from GitHub and fails if the two lists ever disagree, naming both sides rather than assuming
which one is wrong.
