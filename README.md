# Tote Counter

A client-server web application designed to automatically count stacks of black Euro stacking containers (totes) using a Vision Language Model (VLM).

## Architecture Overview

The project is built with a lightweight, decoupled architecture optimized for rapid AI iteration:

- **Frontend (`/static/`)**: A vanilla HTML/JS/CSS mobile-first web app. It handles camera access, frame capture, blur detection, image resizing, and AI polling logic.
- **Backend (`/server/main.py`)**: A FastAPI Python server acting as an API gateway. It serves the static frontend files and exposes a single `/api/count` endpoint.
- **AI Core (`/server/vlm.py` & `prompt.py`)**: Integration with Groq's API using the `meta-llama/llama-4-maverick-17b-128e-instruct` model.

### Why this stack?

1. **FastAPI**: Chosen for its async capabilities, high performance, and ease of serving both static files and REST API endpoints in a single lightweight process.
2. **Vanilla JS Frontend**: Avoids the overhead and build steps of React/Vue for a UI that fundamentally only needs to manage a `<video>` stream and a `<canvas>`.
3. **Groq (meta-llama/llama-4-maverick-17b-128e-instruct)**: Selected for its blazing-fast inference speeds. For a real-time mobile scanning tool, latency is the primary bottleneck.

---

## Evolution & Optimization (The 3 Test Runs)

The core challenge of this project was physical counting accuracy. The totes have very thin nesting lips (~85mm) that are easily missed by computer vision models. To solve this, we ran three major iterations tracking accuracy against 13 real warehouse photos (`test_accuracy.py`).

### Run 1: The Baseline
- **Approach:** Simple instructions: "count bottom tote + lips, return JSON only."
- **Result:** 38% exact match. 
- **Flaw:** High tendency to undercount (missing up to 3 totes per stack). The model was rushing to a conclusion.

### Run 2: Added Physical Context
- **Approach:** Added specific physical awareness to the prompt—highlighting that the bottom 2-3 totes show more body, warning about tightly packed lips, and adding a calibration metric (12 totes = 1.2m). Still requested JSON-only output.
- **Result:** 38% exact match, with slightly better ±1 margins (77%).
- **Flaw:** Still mostly undercounting. Providing context without forcing the model to *use* it wasn't enough.

### Run 3: Chain-of-Thought (The Breakthrough)
- **Approach:** We completely changed the prompt structure. Instead of asking exclusively for JSON, the prompt forces the model to **"Think step by step. Scan from TOP to BOTTOM and number each tote as you go."** The JSON output must be provided on the very last line.
- **Result:** **69% exact match, 100% within ±1 tote error margin.**
- **Why it worked:** Forcing the VLM to visually enumerate the physical features in text ("Tote 1: top rim, Tote 2: next lip down...") forces it to allocate attention and computation to each horizontal edge before committing to a final number. To support this, the backend `vlm.py` parser was rewritten to scan the output backwards to extract the final JSON object.

---

## Production & Mobile Hardening

To make the app viable for real-time mobile use in a warehouse environment, several crucial optimizations were applied to the frontend (`app.js`):

1. **Manual TAP Mode Default**: Continuous polling (AUTO mode) was disabled by default to prevent draining API rate limits and incurring high cloud costs.
2. **Client-Side Blur Detection**: A Laplacian variance calculation guarantees that blurry images captured while moving are discarded *before* sending them to the API, saving bandwidth and preventing bad AI reads.
3. **Image Payloads**: The 720p raw video frame is resized down to 800px width before base64 encoding, drastically reducing upload latency over spotty warehouse cellular networks.
4. **Timeout Handling**: A 15-second `AbortController` handles network dead-zones gracefully without hanging the UI.

---

## Deployment (Render.com)

This project is configured for one-click deployment to **Render**.

1. Commit this repository to GitHub.
2. Link the repository to Render to create a new **Web Service**.
3. Render will automatically detect the `render.yaml` file and configure the build/start commands.
4. **Important:** You must manually set your `GROQ_API_KEY` in the Render Environment Variables dashboard.
