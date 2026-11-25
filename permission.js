// FormMitra — Microphone Permission Page Script

const btn = document.getElementById('allow-mic-btn');
const statusLine = document.getElementById('status-line');

if (btn && statusLine) {
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    statusLine.className = 'status-line';
    statusLine.textContent = 'Requesting microphone permission...';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      statusLine.className = 'status-line success';
      statusLine.textContent = 'Microphone allowed. You can close this tab.';
    } catch (err) {
      btn.disabled = false;
      statusLine.className = 'status-line error';
      statusLine.textContent = `${err.name}: ${err.message}`;
    }
  });
}
