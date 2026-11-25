// FormMitra — Voice State Machine ('idle' | 'recording' | 'transcribing', MediaRecorder + Web Speech fallback)

const SPEECH_LOCALE = {
  en: 'en-IN',
  hi: 'hi-IN',
  kn: 'kn-IN'
};

const AUDIO_CONSTRAINTS = {
  audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
};

export function createVoiceController({
  btnMic,
  micStatus,
  chatInput,
  langSelect,
  sendAction,
  onLanguageDetected,
  onErrorBubble,
  onResizeInput
}) {
  let voiceState = 'idle'; // 'idle' | 'recording' | 'transcribing'
  let mediaRecorder = null;
  let audioStream = null;
  let audioChunks = [];
  let stopTimer = null;
  let recognition = null;
  let activeRunId = 0;
  let recordingMime = 'audio/webm';
  let recordingStartedAt = 0;
  let recordedTooShort = false;

  function setMicUi(stateName, statusText = '') {
    voiceState = stateName;
    btnMic.classList.toggle('recording', stateName === 'recording');
    btnMic.classList.toggle('busy', stateName === 'transcribing');
    btnMic.disabled = stateName === 'transcribing';
    btnMic.setAttribute('aria-label', stateName === 'recording' ? 'Stop recording' : 'Voice input');
    micStatus.textContent = statusText;
    micStatus.classList.toggle('hidden', !statusText);
  }

  function stopTracks() {
    if (!audioStream) return;
    audioStream.getTracks().forEach((t) => {
      try { t.stop(); } catch (_) {}
    });
    audioStream = null;
  }

  function cleanup(keepStatus = false) {
    activeRunId += 1;
    clearTimeout(stopTimer);
    stopTimer = null;

    if (mediaRecorder) {
      mediaRecorder.ondataavailable = null;
      mediaRecorder.onstop = null;
      mediaRecorder.onerror = null;
      if (mediaRecorder.state !== 'inactive') {
        try { mediaRecorder.stop(); } catch (_) {}
      }
      mediaRecorder = null;
    }

    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try { recognition.abort(); } catch (_) {}
      recognition = null;
    }

    stopTracks();
    audioChunks = [];
    setMicUi('idle', keepStatus ? micStatus.textContent : '');
  }

  function getLangHint() {
    const val = langSelect ? langSelect.value : 'en';
    return ['en', 'hi', 'kn'].includes(val) ? val : 'auto';
  }

  function applyTranscript(text, detectedLang, sentLangHint, wrongScript = false) {
    const clean = String(text || '').trim();
    if (!clean) {
      cleanup();
      setMicUi('idle', "I couldn't hear anything. Try again closer to the mic.");
      return;
    }

    chatInput.value = clean;
    onResizeInput();
    chatInput.focus();

    if (sentLangHint === 'en' && (detectedLang === 'hi' || detectedLang === 'kn')) {
      onLanguageDetected(detectedLang);
    }
    cleanup();
    if (wrongScript) {
      setMicUi('idle', 'I heard this as English. Speak a little slower, or check the language in the header.');
    }
  }

  function startWebSpeechFallback(priorError, langHint) {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      const detail = priorError || 'Speech recognition is unavailable in this browser.';
      cleanup();
      onErrorBubble('Voice transcription failed.', detail, () => toggle());
      return;
    }

    const rec = new SpeechRec();
    recognition = rec;
    rec.lang = SPEECH_LOCALE[langHint] || 'en-IN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    setMicUi('recording', 'Listening via browser speech... tap again to stop');

    rec.onresult = (e) => {
      const text = e.results?.[0]?.[0]?.transcript || '';
      recognition = null;
      applyTranscript(text, 'other', langHint, false);
    };

    rec.onerror = (e) => {
      const errCode = e.error || 'network';
      recognition = null;
      cleanup();
      if (errCode === 'no-speech') {
        setMicUi('idle', "I couldn't hear anything. Try again closer to the mic.");
        return;
      }
      const combined = priorError ? `${priorError} | speech: ${errCode}` : errCode;
      onErrorBubble('Voice input failed.', combined, () => toggle());
    };

    rec.onend = () => {
      if (recognition === rec) {
        recognition = null;
        cleanup();
      }
    };

    try {
      rec.start();
    } catch (err) {
      recognition = null;
      cleanup();
      onErrorBubble('Voice input failed.', `${err.name || 'speech'}: ${err.message}`, () => toggle());
    }
  }

  function transcribeBlob(blob, mimeType, runId, langHint) {
    const reader = new FileReader();

    reader.onerror = () => {
      if (runId !== activeRunId) return;
      const msg = reader.error ? `${reader.error.name}: ${reader.error.message}` : 'FileReader error';
      startWebSpeechFallback(msg, langHint);
    };

    reader.onloadend = async () => {
      if (runId !== activeRunId) return;
      if (typeof reader.result !== 'string' || !reader.result.includes(',')) {
        startWebSpeechFallback('Empty audio recording.', langHint);
        return;
      }

      const base64 = reader.result.split(',')[1];
      const resp = await sendAction({ action: 'TRANSCRIBE', base64, mimeType, langHint });
      if (runId !== activeRunId) return;

      if (resp.ok && resp.data) {
        applyTranscript(resp.data.text, resp.data.language, langHint, Boolean(resp.data.wrongScript));
        return;
      }

      startWebSpeechFallback(resp.error || resp.summary || 'Provider transcription failed.', langHint);
    };

    reader.readAsDataURL(blob);
  }

  function stopImmediately() {
    if (voiceState !== 'recording') return;
    clearTimeout(stopTimer);
    stopTimer = null;

    if (recognition) {
      setMicUi('transcribing', 'Finishing speech...');
      try { recognition.stop(); } catch (_) { cleanup(); }
      return;
    }

    recordedTooShort = recordingStartedAt > 0 && (Date.now() - recordingStartedAt) < 800;
    recordingMime = (mediaRecorder && mediaRecorder.mimeType) || 'audio/webm';
    setMicUi('transcribing', 'Transcribing...');

    // Stop recorder AND every stream track in the same tick
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try { mediaRecorder.stop(); } catch (_) { cleanup(); }
    } else {
      stopTracks();
      cleanup();
    }
    stopTracks();
  }

  async function toggle() {
    if (voiceState === 'transcribing') return;
    if (voiceState === 'recording') {
      stopImmediately();
      return;
    }

    const runId = ++activeRunId;
    const langHint = getLangHint();
    try {
      const stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
      if (runId !== activeRunId) {
        stream.getTracks().forEach((t) => { try { t.stop(); } catch (_) {} });
        return;
      }
      audioStream = stream;
      audioChunks = [];
      recordedTooShort = false;

      let mr;
      const opusSupported = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus');
      const recOpts = opusSupported ? { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 64000 } : { audioBitsPerSecond: 64000 };
      try { mr = new MediaRecorder(stream, recOpts); } catch (_) { mr = new MediaRecorder(stream); }
      mediaRecorder = mr;
      recordingMime = mr.mimeType || 'audio/webm';

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunks.push(e.data);
      };

      mr.onerror = (e) => {
        const err = e.error;
        cleanup();
        onErrorBubble('Recording failed.', `${err?.name || 'recording-error'}: ${err?.message || 'MediaRecorder error'}`, () => toggle());
      };

      mr.onstop = () => {
        const blob = new Blob(audioChunks, { type: recordingMime });
        audioChunks = [];
        mediaRecorder = null;
        if (runId !== activeRunId) return;
        if (recordedTooShort) {
          cleanup();
          setMicUi('idle', 'That was too short. Tap the mic, speak, then tap again.');
          return;
        }
        transcribeBlob(blob, recordingMime, runId, langHint);
      };

      recordingStartedAt = Date.now();
      mr.start();
      setMicUi('recording', 'Listening... tap again to stop');

      stopTimer = setTimeout(() => {
        if (voiceState === 'recording') stopImmediately();
      }, 12000);
    } catch (err) {
      cleanup();
      const name = err?.name || 'audio-capture';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
        setMicUi('idle', 'Please allow the microphone in the tab that just opened, then press the mic again.');
        return;
      }
      onErrorBubble('Could not access microphone.', `${name}: ${err?.message || 'Microphone error'}`, () => toggle());
    }
  }

  return { toggle, cleanup };
}
