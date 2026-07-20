# NOT HOT DOG

NOT HOT DOG uses wildly impressive AI technology to identify hotdogs—and, very
importantly, not-hotdogs. It is available for **FREE**, because the creator of
this app is **RICH!**

<h2 align="center">
  <a href="https://jayl-dev.github.io/nothotdog/"><strong><u>Live Webapp</u></strong></a>
</h2>

<p align="center">
  It uses a camera, so access it from a phone or a device with a webcam.
</p>

<p align="center">
  <strong><a href="https://www.youtube.com/watch?v=AJsOA4Zl6Io">Watch the official HBO clip on YouTube</a></strong><br /><br />
  <a href="https://www.youtube.com/watch?v=AJsOA4Zl6Io">
    <img src="screenshots/youtube.png" alt="Watch the official NOT HOT DOG clip from HBO on YouTube" width="720" />
  </a>
</p>

<p align="center">
  <strong>See the world-changing technology in action:</strong><br />
  <img src="screenshots/seefood.gif" alt="Animated demonstration of the NOT HOT DOG app" width="200" />
</p>

## Run locally

```bash
npm ci
npm start
```

`npm start` creates a fresh production build in `dist/`, serves it at
`http://localhost:3000`, and opens the app in your browser. Camera access
requires `localhost` or HTTPS; opening `index.html` directly will not work.

## How it works

NOT HOT DOG is a web app, so it cannot directly use native mobile AI frameworks
such as Core ML on iOS or Android's on-device ML APIs. Instead, it runs the
bundled model through TensorFlow.js directly in the browser, using WebGL for
hardware acceleration and falling back to the CPU when necessary. The camera
image and AI inference remain on the device.

## Commands

```bash
npm run build   # Clean production build in dist/
npm start       # Build, serve, and open the browser
```

Pushes to `main` are built and deployed automatically to GitHub Pages. In the
repository settings, select **GitHub Actions** as the Pages source once; the
workflow handles subsequent deployments.

## Credits

Object detection is powered by TensorFlow.js and the official
[COCO-SSD Lite MobileNetV2](https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd)
model. It recognizes the 80 object classes defined by the
[COCO dataset](https://cocodataset.org/) and runs entirely in the browser.

This app was completely **vibe-coded** to experiment with the coding capabilities
of various models and agent harnesses.
