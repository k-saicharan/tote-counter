const video = document.getElementById("camera");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const countEl = document.getElementById("count");
const countDisplay = document.getElementById("count-display");
const confidenceBadge = document.getElementById("confidence-badge");
const statusEl = document.getElementById("status");
const btnMode = document.getElementById("btn-mode");

let autoMode = false; // TAP is default — saves API calls
let polling = false;
let intervalId = null;
const POLL_INTERVAL_MS = 8000; // 8s — gives API time to respond
const REQUEST_TIMEOUT_MS = 15000; // 15s timeout per request
const BLUR_THRESHOLD = 35; // Laplacian variance threshold
const UPLOAD_WIDTH = 800; // resize before upload

// --- Camera Setup ---
async function initCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    statusEl.textContent = "Camera ready. Tap screen to scan.";
  } catch (err) {
    statusEl.textContent = "Camera access denied. Please allow camera.";
    console.error("Camera error:", err);
  }
}

// --- Blur Detection (Laplacian variance) ---
function isBlurry(imageData) {
  const { data, width, height } = imageData;

  // Convert to grayscale and compute Laplacian variance on a downsampled grid
  const step = 2; // sample every 2nd pixel for speed
  let sum = 0;
  let sumSq = 0;
  let n = 0;

  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      const idx = (y * width + x) * 4;
      const center = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
      const top = data[((y - 1) * width + x) * 4] * 0.299 + data[((y - 1) * width + x) * 4 + 1] * 0.587 + data[((y - 1) * width + x) * 4 + 2] * 0.114;
      const bottom = data[((y + 1) * width + x) * 4] * 0.299 + data[((y + 1) * width + x) * 4 + 1] * 0.587 + data[((y + 1) * width + x) * 4 + 2] * 0.114;
      const left = data[(y * width + (x - 1)) * 4] * 0.299 + data[(y * width + (x - 1)) * 4 + 1] * 0.587 + data[(y * width + (x - 1)) * 4 + 2] * 0.114;
      const right = data[(y * width + (x + 1)) * 4] * 0.299 + data[(y * width + (x + 1)) * 4 + 1] * 0.587 + data[(y * width + (x + 1)) * 4 + 2] * 0.114;

      const laplacian = top + bottom + left + right - 4 * center;
      sum += laplacian;
      sumSq += laplacian * laplacian;
      n++;
    }
  }

  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  return variance < BLUR_THRESHOLD;
}

// --- Frame Capture (resized) ---
function captureFrame() {
  // Draw full-res first to check blur
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);

  // Blur check
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (isBlurry(imageData)) {
    return null; // signal blurry frame
  }

  // Resize for upload — saves bandwidth
  const scale = UPLOAD_WIDTH / canvas.width;
  const newH = Math.round(canvas.height * scale);
  canvas.width = UPLOAD_WIDTH;
  canvas.height = newH;
  ctx.drawImage(video, 0, 0, UPLOAD_WIDTH, newH);

  return canvas.toDataURL("image/jpeg", 0.75);
}

// --- API Call with timeout ---
async function sendForCounting() {
  if (polling) return;
  polling = true;
  statusEl.textContent = "Scanning...";

  const imageData = captureFrame();

  if (imageData === null) {
    statusEl.textContent = "Image too blurry — hold steady.";
    polling = false;
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch("/api/count", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: imageData }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || res.statusText);
    }

    const data = await res.json();
    updateDisplay(data);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      statusEl.textContent = "Request timed out — try again.";
    } else {
      statusEl.textContent = `Error: ${err.message}`;
    }
    console.error("API error:", err);
  } finally {
    polling = false;
  }
}

// --- Display Update ---
function updateDisplay(data) {
  const { count, confidence, warning } = data;

  countEl.textContent = count >= 0 ? count : "—";

  confidenceBadge.textContent = confidence;
  confidenceBadge.className = confidence;

  countDisplay.classList.toggle("at-limit", count >= 12);

  let status = `Count: ${count} totes`;
  if (confidence === "medium") status += " (±1)";
  if (confidence === "low") status += " (uncertain)";
  if (warning) status += ` — ${warning}`;
  statusEl.textContent = status;
}

// --- Polling Control ---
function startAutoPolling() {
  if (intervalId) return;
  intervalId = setInterval(() => {
    if (autoMode) sendForCounting();
  }, POLL_INTERVAL_MS);
  sendForCounting();
}

function stopAutoPolling() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

// --- Mode Toggle ---
btnMode.addEventListener("click", () => {
  autoMode = !autoMode;
  btnMode.textContent = autoMode ? "AUTO" : "TAP";

  if (autoMode) {
    startAutoPolling();
    statusEl.textContent = "Auto-scanning every 8 seconds...";
  } else {
    stopAutoPolling();
    statusEl.textContent = "Tap the screen to scan.";
  }
});

// Tap-to-scan (works in both modes, but primary UX in TAP mode)
video.addEventListener("click", () => {
  sendForCounting();
});

// --- Init ---
initCamera();
