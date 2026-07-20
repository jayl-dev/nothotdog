import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs-backend-cpu';
import '@tensorflow/tfjs-backend-webgl';
import lottie from 'lottie-web/build/player/lottie_light';
import checkAnimationData from './lottie/checkmark.json';
import crossAnimationData from './lottie/cross.json';
import confettiAnimationData from './lottie/confetti.json';
import cocoClassLines from './coco-class-lines';

(() => {
  'use strict';

  const els = {
    video: document.getElementById('video'),
    canvas: document.getElementById('canvas'),
    captureGuide: document.getElementById('capture-guide'),
    captureGuideLabel: document.getElementById('capture-guide-label'),
    flash: document.getElementById('flash'),
    shootBtn: document.getElementById('shoot-btn'),
    cameraStatus: document.getElementById('camera-status'),
    cameraStatusText: document.getElementById('camera-status-text'),
    startupSpinner: document.getElementById('startup-spinner'),
    retryCameraBtn: document.getElementById('retry-camera'),
    screens: {
      camera: document.getElementById('screen-camera'),
      evaluating: document.getElementById('screen-evaluating'),
      result: document.getElementById('screen-result'),
    },
    evalBg: document.getElementById('eval-bg'),
    resultBg: document.getElementById('result-bg'),
    resultOverlay: document.getElementById('result-overlay'),
    confettiLottie: document.getElementById('confetti-lottie'),
    lottieContainer: document.getElementById('lottie-container'),
    resultText: document.getElementById('result-text'),
    resultSub: document.getElementById('result-sub'),
    resultLine: document.getElementById('result-line'),
    resultDetailsToggle: document.getElementById('result-details-toggle'),
    resultDetails: document.getElementById('result-details'),
    retryBtn: document.getElementById('retry-btn'),
  };

  // COCO-SSD's default is 0.5. A slightly lower cutoff catches more real
  // hotdogs at odd angles while still requiring an actual "hot dog" box.
  const HOTDOG_DETECTION_THRESHOLD = 0.25;
  // Spec 2.2: evaluating screen shows for ~0.8-1.2s even if inference is faster.
  const MIN_EVAL_MS = 1000;
  const CAMERA_PERMISSION_TIMEOUT_MS = 12000;
  const MODEL_LOAD_TIMEOUT_MS = 30000;
  const DETECTION_INPUT_SIZE = 300;

  const MODEL_LOADING_LINES = [
    'Initializing the intelligence layer…',
    'Applying machine learning to make the world a better place…',
    'Disrupting visual recognition with ethically sourced tensors…',
    'Pivoting toward scalable object detection…',
  ];

  const CAPTURE_GUIDE_LINES = [
    'Center the next big thing',
    'Put disruption in the box',
    'Align your vision here',
    'Frame the future',
    'Center your market opportunity',
    'Place innovation inside',
    'Aim for product–market fit',
    'Insert scalable object here',
    'Focus the disruption',
    'Synergize within this rectangle',
    'Put tomorrow in the box',
    'Center your billion-dollar idea',
  ];

  let model = null;
  let modelReady = false;
  let cameraReady = false;
  let stream = null;
  let modelState = 'idle';
  let cameraState = 'idle';
  let cameraErrorMessage = '';
  let cameraRequestId = 0;
  let modelMessageIndex = 0;
  let modelMessageTimer = null;
  let resultAnimation = null;
  let confettiAnimation = null;
  let captureGuideLineIndex = Math.floor(Math.random() * CAPTURE_GUIDE_LINES.length);

  const HOTDOG_LINES = [
    'The decentralized sausage protocol has reached consensus.',
    'A Series A–ready cylindrical meat achievement.',
    'Finally: technology making the world a better place.',
    'Our proprietary lunch stack says this checks out.',
  ];

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function rotateCaptureGuideLine() {
    els.captureGuideLabel.textContent = CAPTURE_GUIDE_LINES[captureGuideLineIndex];
    captureGuideLineIndex = (captureGuideLineIndex + 1) % CAPTURE_GUIDE_LINES.length;
  }

  function niceLabel(raw) {
    if (!raw) return 'anything hotdog-adjacent';
    return raw.split(',')[0].trim();
  }

  function notHotdogLine(label) {
    if (!label) {
      return pick([
        'No hotdog achieved product-market fit in this frame.',
        'The vision stack found zero investable lunch opportunities.',
        'We scanned the entire disruption surface. Not a hotdog in sight.',
      ]);
    }
    const clean = niceLabel(label);
    const classLine = cocoClassLines[clean.toLowerCase()];
    if (classLine) return classLine;
    const templates = [
      `The board regrets to report that this is a ${clean}.`,
      `Our disruptive lunch algorithm detected: ${clean}.`,
      `A bold pivot, but unfortunately still a ${clean}.`,
      `The compression worked. The hotdog did not. Looks like a ${clean}.`,
    ];
    return pick(templates);
  }

  function showScreen(name) {
    Object.entries(els.screens).forEach(([key, el]) => {
      el.classList.toggle('active', key === name);
    });
  }

  function setCameraStatus(text, { showRetry = false } = {}) {
    if (!text) {
      els.cameraStatus.hidden = true;
      els.cameraStatus.classList.remove('is-visible');
      els.cameraStatusText.textContent = '';
      els.retryCameraBtn.hidden = true;
      return;
    }
    els.cameraStatus.hidden = false;
    els.cameraStatus.classList.add('is-visible');
    els.cameraStatusText.textContent = text;
    els.retryCameraBtn.hidden = !showRetry;
  }

  function renderInitializationStatus() {
    document.documentElement.dataset.cameraState = cameraState;
    document.documentElement.dataset.modelState = modelState;

    let text = '';
    let showRetry = false;
    let showSpinner = false;

    if (modelState === 'loading' || modelState === 'idle') {
      text = MODEL_LOADING_LINES[modelMessageIndex];
      showSpinner = true;
    } else if (modelState === 'error') {
      text = 'The AI pivoted into a wall. Could not initialize the model.';
      showRetry = true;
    } else if (cameraState === 'requesting' || cameraState === 'idle') {
      text = 'AI ready. One tiny permission before we change the world: allow camera access.';
      showSpinner = true;
    } else if (cameraState === 'error') {
      text = cameraErrorMessage;
      showRetry = true;
    } else if (modelReady && cameraReady) {
      els.startupSpinner.hidden = true;
      setCameraStatus(null);
      return;
    }

    els.startupSpinner.hidden = !showSpinner;
    setCameraStatus(text, { showRetry });
  }

  function updateShootAvailability() {
    els.shootBtn.disabled = !(modelReady && cameraReady);
  }

  function rejectAfter(ms, message) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }

  async function initCamera() {
    if (cameraState === 'requesting' || cameraState === 'ready') return;

    const requestId = ++cameraRequestId;
    cameraState = 'requesting';
    cameraErrorMessage = '';
    renderInitializationStatus();

    if (!window.isSecureContext) {
      cameraState = 'error';
      cameraErrorMessage = 'Camera access needs HTTPS or localhost. Even world-changing AI has compliance requirements.';
      renderInitializationStatus();
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cameraState = 'error';
      cameraErrorMessage = "This browser can't access the camera. Try Chrome or Safari.";
      renderInitializationStatus();
      return;
    }

    const permissionTimer = setTimeout(() => {
      if (requestId !== cameraRequestId || cameraReady) return;
      cameraState = 'error';
      cameraErrorMessage = 'The AI is ready, but camera permission is still in committee. Allow it in your browser, then try again.';
      renderInitializationStatus();
    }, CAMERA_PERMISSION_TIMEOUT_MS);

    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });

      if (requestId !== cameraRequestId) {
        nextStream.getTracks().forEach((track) => track.stop());
        return;
      }

      clearTimeout(permissionTimer);
      stream = nextStream;
      els.video.srcObject = stream;
      cameraReady = true;
      cameraState = 'ready';
      document.documentElement.dataset.cameraPlayback = 'starting';
      renderInitializationStatus();
      updateShootAvailability();

      // A browser can leave play() pending even after camera permission and
      // getUserMedia() have succeeded. Do not let that promise block readiness.
      try {
        const playback = els.video.play();
        if (playback && typeof playback.then === 'function') {
          playback
            .then(() => {
              document.documentElement.dataset.cameraPlayback = 'playing';
            })
            .catch((playbackError) => {
              document.documentElement.dataset.cameraPlayback = 'blocked';
              console.warn('Camera preview playback was delayed:', playbackError);
            });
        }
      } catch (playbackError) {
        document.documentElement.dataset.cameraPlayback = 'blocked';
        console.warn('Camera preview playback was delayed:', playbackError);
      }
    } catch (err) {
      if (requestId !== cameraRequestId) return;
      clearTimeout(permissionTimer);
      console.error('Camera error:', err);
      let msg = 'Camera access failed. Check permissions and try again.';
      if (err && err.name === 'NotAllowedError') {
        msg = 'The board rejected camera access. Allow it in browser settings, then try again.';
      } else if (err && err.name === 'NotFoundError') {
        msg = 'No camera found on this device.';
      }
      cameraState = 'error';
      cameraErrorMessage = msg;
      renderInitializationStatus();
    }
  }

  async function initModel() {
    if (modelState === 'loading' || modelState === 'ready') return;

    const initStartedAt = performance.now();
    modelState = 'loading';
    modelReady = false;
    modelMessageIndex = 0;
    document.documentElement.dataset.modelReady = 'loading';
    clearInterval(modelMessageTimer);
    modelMessageTimer = setInterval(() => {
      modelMessageIndex = (modelMessageIndex + 1) % MODEL_LOADING_LINES.length;
      renderInitializationStatus();
    }, 2200);
    renderInitializationStatus();

    try {
      // Prefer the faster WebGL backend, but retain CPU support for browsers or
      // devices where WebGL initialization is unavailable.
      let backendReady = false;
      for (const backend of ['webgl', 'cpu']) {
        try {
          if (await tf.setBackend(backend)) {
            await tf.ready();
            backendReady = true;
            break;
          }
        } catch (backendError) {
          console.warn(`TensorFlow ${backend} backend unavailable:`, backendError);
        }
      }
      if (!backendReady) throw new Error('No TensorFlow.js backend could be initialized.');
      document.documentElement.dataset.tensorflowBackend = tf.getBackend();

      model = await Promise.race([
        cocoSsd.load({
          base: 'lite_mobilenet_v2',
          modelUrl: 'models/coco-ssd-lite-mobilenet-v2/model.json?v=local-1',
        }),
        rejectAfter(MODEL_LOAD_TIMEOUT_MS, 'Model initialization timed out.'),
      ]);
      document.documentElement.dataset.modelArchitecture = 'coco-ssd-lite-mobilenet-v2';
      modelReady = true;
      modelState = 'ready';
      clearInterval(modelMessageTimer);
      document.documentElement.dataset.modelReady = 'true';
      document.documentElement.dataset.modelReadyMs = String(
        Math.round(performance.now() - initStartedAt)
      );
      renderInitializationStatus();
      updateShootAvailability();
    } catch (err) {
      clearInterval(modelMessageTimer);
      console.error('Model load error:', err);
      modelState = 'error';
      document.documentElement.dataset.modelReady = 'false';
      renderInitializationStatus();
    }
  }

  function retryInitialization() {
    if (modelState === 'error') initModel();
    if (cameraState === 'error') initCamera();
  }

  function classifyDetections(detections) {
    const ranked = [...detections].sort((a, b) => b.score - a.score);
    const hotdogMatch = ranked.find((detection) => /^hot dog$/i.test(detection.class));
    if (hotdogMatch && hotdogMatch.score >= HOTDOG_DETECTION_THRESHOLD) {
      return { isHotdog: true, confidence: hotdogMatch.score, label: hotdogMatch.class };
    }

    const top = ranked[0];
    return { isHotdog: false, confidence: top ? top.score : 0, label: top ? top.class : '' };
  }

  function renderResult({ isHotdog, confidence, label }) {
    const pct = Math.round((confidence || 0) * 100);
    const identifiedObject = label ? niceLabel(label) : 'no recognized object';
    
    if (resultAnimation) resultAnimation.destroy();
    if (confettiAnimation) confettiAnimation.destroy();
    els.lottieContainer.innerHTML = '';
    els.confettiLottie.innerHTML = '';
    els.resultOverlay.className = `result-overlay ${isHotdog ? 'is-hotdog' : 'is-not'}`;
    
    if (isHotdog) {
      resultAnimation = lottie.loadAnimation({
        container: els.lottieContainer,
        renderer: 'svg',
        loop: false,
        autoplay: true,
        animationData: checkAnimationData,
        rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
      });

      confettiAnimation = lottie.loadAnimation({
        container: els.confettiLottie,
        renderer: 'svg',
        loop: false,
        autoplay: true,
        animationData: confettiAnimationData,
        rendererSettings: { preserveAspectRatio: 'xMidYMid slice' },
      });
      
      els.resultText.textContent = 'CERTIFIED HOTDOG';
      els.resultText.className = 'result-text is-hotdog';
      els.resultLine.textContent = pick(HOTDOG_LINES);
      
    } else {
      resultAnimation = lottie.loadAnimation({
        container: els.lottieContainer,
        renderer: 'svg',
        loop: false,
        autoplay: true,
        animationData: crossAnimationData,
        rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
      });
      
      els.resultText.textContent = 'ABSOLUTELY NOT';
      els.resultText.className = 'result-text is-not';
      els.resultLine.textContent = notHotdogLine(label);
    }

    els.resultDetails.textContent = `Identified: ${identifiedObject} · Score: ${pct}%`;
    els.resultDetails.hidden = true;
    els.resultDetailsToggle.setAttribute('aria-expanded', 'false');
  }

  function toggleResultDetails() {
    const shouldShow = els.resultDetails.hidden;
    els.resultDetails.hidden = !shouldShow;
    els.resultDetailsToggle.setAttribute('aria-expanded', String(shouldShow));
  }

  function createCenteredDetectionCrop(sourceCanvas) {
    const videoRect = els.video.getBoundingClientRect();
    const guideRect = els.captureGuide.getBoundingClientRect();
    const sourceWidth = sourceCanvas.width;
    const sourceHeight = sourceCanvas.height;

    // Map the visible guide back through the video's object-fit: cover transform.
    const coverScale = Math.max(
      videoRect.width / sourceWidth,
      videoRect.height / sourceHeight
    );
    const renderedWidth = sourceWidth * coverScale;
    const renderedHeight = sourceHeight * coverScale;
    const renderedLeft = (videoRect.width - renderedWidth) / 2;
    const renderedTop = (videoRect.height - renderedHeight) / 2;
    const guideCenterX = guideRect.left + guideRect.width / 2 - videoRect.left;
    const guideCenterY = guideRect.top + guideRect.height / 2 - videoRect.top;
    const sourceCenterX = (guideCenterX - renderedLeft) / coverScale;
    const sourceCenterY = (guideCenterY - renderedTop) / coverScale;
    const sourceSize = Math.min(guideRect.width, guideRect.height) / coverScale;
    const sourceX = Math.max(0, Math.min(sourceWidth - sourceSize, sourceCenterX - sourceSize / 2));
    const sourceY = Math.max(0, Math.min(sourceHeight - sourceSize, sourceCenterY - sourceSize / 2));

    const detectionCanvas = document.createElement('canvas');
    detectionCanvas.width = DETECTION_INPUT_SIZE;
    detectionCanvas.height = DETECTION_INPUT_SIZE;
    detectionCanvas.getContext('2d').drawImage(
      sourceCanvas,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      DETECTION_INPUT_SIZE,
      DETECTION_INPUT_SIZE
    );

    document.documentElement.dataset.detectionCrop = [sourceX, sourceY, sourceSize]
      .map((value) => Math.round(value))
      .join(',');
    return detectionCanvas;
  }

  async function handleShoot() {
    if (els.shootBtn.disabled || !model) return;

    els.flash.classList.remove('go');
    void els.flash.offsetWidth; // restart animation
    els.flash.classList.add('go');

    const video = els.video;
    const canvas = els.canvas;
    const w = video.videoWidth || 480;
    const h = video.videoHeight || 640;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, w, h);
    const detectionCanvas = createCenteredDetectionCrop(canvas);

    let dataUrl = '';
    try {
      dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    } catch (e) {
      console.warn('Could not export frame for background preview:', e);
    }
    if (dataUrl) {
      els.evalBg.style.backgroundImage = `url(${dataUrl})`;
      els.resultBg.style.backgroundImage = `url(${dataUrl})`;
    }

    showScreen('evaluating');

    const start = Date.now();
    let detections = [];
    try {
      detections = await model.detect(detectionCanvas, 20, HOTDOG_DETECTION_THRESHOLD);
    } catch (err) {
      console.error('Object detection error:', err);
    }

    const elapsed = Date.now() - start;
    const remaining = MIN_EVAL_MS - elapsed;
    if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));

    renderResult(classifyDetections(detections));
    showScreen('result');
  }

  function resetToCamera() {
    if (resultAnimation) {
      resultAnimation.destroy();
      resultAnimation = null;
    }
    if (confettiAnimation) {
      confettiAnimation.destroy();
      confettiAnimation = null;
    }
    showScreen('camera');
  }

  els.shootBtn.addEventListener('click', handleShoot);
  els.retryBtn.addEventListener('click', resetToCamera);
  els.retryCameraBtn.addEventListener('click', retryInitialization);
  els.resultDetailsToggle.addEventListener('click', toggleResultDetails);

  rotateCaptureGuideLine();
  setInterval(rotateCaptureGuideLine, 3200);

  initModel();
  initCamera();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('service-worker.js', { updateViaCache: 'none' })
        .then((registration) => registration.update())
        .catch((err) => {
          console.warn('Service worker registration failed:', err);
        });
    });
  }
})();
