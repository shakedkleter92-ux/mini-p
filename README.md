# Mini P

A web app for mini Bluetooth thermal printers of the "Cat Printer" family
(X6h, GB0x, MX0x and similar, the printers that ship with apps like Tiny Print).
It is black and white, works offline, and installs on your phone like a regular app.

## What it does

- **Free-layout editor.** Place text, photos, lists, QR codes, drawings, emoji,
  dividers and receipts anywhere on the paper. Blocks can sit side by side or
  overlap. Drag to move them, and use the corner handle to resize.
- **50 free Google Fonts.** 34 of them include Hebrew, with letter spacing and
  right-to-left support.
- **Photo effects.** Atkinson, Floyd–Steinberg, Stucki, Jarvis, Sierra,
  Bayer 2×2/4×4/8×8, Noise, Random, Halftone, Lines, Hatch, Pixel, Stipple,
  Sketch and Comic, with dot size and grain controls.
- **Live camera.** Shows the print effect in real time while you take the photo.
- **Receipt block.** Fill in the business name, items, quantities and prices.
  Totals and VAT are calculated for you, and you can add a Code 39 barcode and
  English or Hebrew labels.
- **Templates and saved designs,** plus automatic saving of your current design.
- **Print settings:** darkness, speed, copies, and a feed button for tearing
  the paper off.
- **Pixel cat mascot** that reacts to everything you do.

## Using it

Open the published page in a browser that supports Web Bluetooth:

| Device | Browser |
|---|---|
| Mac / Windows / ChromeOS / Android | Chrome or Edge |
| iPhone / iPad | [Bluefy](https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055) (Safari has no Web Bluetooth) |

Tap **Connect** and choose your printer (for example `X6h-XXXX`). To install
it as an app, use the browser's **Install app** or **Add to Home Screen**.

## Running locally

```sh
python3 -m http.server 8765
# then open http://localhost:8765
```

Web Bluetooth and the camera only work on `https://` or `localhost`.

## Project layout

```
index.html            UI markup and icons
css/app.css           design system and layout
js/app.js             app logic: blocks, editor, dialogs, camera, printing
js/render.js          turns blocks into 1-bit, 384-dot images; all the effects
js/printer.js         Bluetooth driver for the Cat Printer protocol
js/pixel.js           pixel-art cat mascot
js/fonts.js           Google Fonts list and loader
js/vendor/qrcode.js   QR code generator (MIT, Kazuhiko Arase)
sw.js                 offline cache
```
