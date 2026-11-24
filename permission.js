// Web Helper — Microphone Permission Handler
// Handles granting microphone access from a dedicated extension tab.

(function () {
  'use strict';

  const btn = document.getElementById('allow-mic-btn');
  const statusLine = document.getElementById('status-line');

  if (btn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      statusLine.className = 'status-line';
      statusLine.textContent = 'Requesting access…';

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Immediately stop all tracks to release the mic
        stream.getTracks().forEach((track) => track.stop());

        statusLine.className = 'status-line success';
        statusLine.textContent = 'Microphone allowed. You can close this tab and use the mic in the side panel.';
      } catch (err) {
        btn.disabled = false;
        statusLine.className = 'status-line error';
        statusLine.textContent = `Microphone error: ${err.name} — ${err.message}`;
      }
    });
  }
})();
