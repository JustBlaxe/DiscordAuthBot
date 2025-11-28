const cfgEl = document.getElementById("cfg");
const SESSION_ID = cfgEl?.dataset.sid;
const CSRF_TOKEN = cfgEl?.dataset.csrf;

(async function verify() {
  const statusEl = document.getElementById("st");
  const spinnerEl = document.getElementById("sp");
  const blockedUserEl = document.getElementById("bu");
  const blockedAvatarEl = document.getElementById("ba");
  const blockedNameEl = document.getElementById("bn");

  try {
    const fingerprint = await collectFingerprint();
    const hash = await hashFingerprint(fingerprint);

    const response = await fetch("/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sid: SESSION_ID,
        csrf: CSRF_TOKEN,
        fp: hash,
        sr: fingerprint.screenResolution,
        tz: fingerprint.timezone,
        hc: fingerprint.hardwareConcurrency,
        ua: fingerprint.userAgent,
      }),
    });

    const data = await response.json();
    spinnerEl.style.display = "none";

    if (data.success) {
      statusEl.className = "status ok";
      statusEl.textContent = "Verified! You can close this page.";
    } else {
      statusEl.className = "status err";
      statusEl.textContent = data.message;

      if (data.blockedBy) {
        blockedUserEl.style.display = "block";
        blockedAvatarEl.src = data.blockedBy.avatar;
        blockedNameEl.textContent = data.blockedBy.username;
      }
    }
  } catch (error) {
    spinnerEl.style.display = "none";
    statusEl.className = "status err";
    statusEl.textContent = "Verification failed";
    console.error("Verification error:", error);
  }
})();

async function collectFingerprint() {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    languages: navigator.languages?.join(",") || "",
    screenResolution: `${screen.width}x${screen.height}`,
    availableResolution: `${screen.availWidth}x${screen.availHeight}`,
    colorDepth: screen.colorDepth,
    pixelRatio: window.devicePixelRatio,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffset: new Date().getTimezoneOffset(),
    hardwareConcurrency: navigator.hardwareConcurrency || 0,
    deviceMemory: navigator.deviceMemory || 0,
    maxTouchPoints: navigator.maxTouchPoints || 0,
    doNotTrack: navigator.doNotTrack,
    webgl: getWebGLFingerprint(),
    audio: getAudioFingerprint(),
    canvas: getCanvasFingerprint(),
  };
}

function getWebGLFingerprint() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),
      renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
    };
  } catch {
    return { vendor: "", renderer: "" };
  }
}

function getAudioFingerprint() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return "";

    const context = new AudioContext();
    if (context.state === "suspended") {
      context.close();
      return "";
    }

    const oscillator = context.createOscillator();
    const compressor = context.createDynamicsCompressor();

    oscillator.type = "triangle";
    oscillator.frequency.value = 10000;
    compressor.threshold.value = -50;
    compressor.knee.value = 40;
    compressor.ratio.value = 12;
    compressor.attack.value = 0;
    compressor.release.value = 0.25;

    oscillator.connect(compressor);
    compressor.connect(context.destination);
    oscillator.start(0);

    const reduction = compressor.reduction;
    oscillator.disconnect();
    context.close();

    return reduction.toString();
  } catch {
    return "";
  }
}

function getCanvasFingerprint() {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;

    const ctx = canvas.getContext("2d");
    ctx.textBaseline = "alphabetic";
    ctx.font = "14px Arial";
    ctx.fillStyle = "#f60";
    ctx.fillRect(0, 0, 100, 50);
    ctx.fillStyle = "#069";
    ctx.fillText("fingerprint", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("fingerprint", 4, 17);

    return canvas.toDataURL().slice(-100);
  } catch {
    return "";
  }
}

async function hashFingerprint(fingerprint) {
  const data = JSON.stringify(fingerprint);
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(buffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
