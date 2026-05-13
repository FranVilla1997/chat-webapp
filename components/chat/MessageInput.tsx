'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface MessageInputProps {
  onSend: (text: string) => void;
  onSendAudio: (base64: string, duration: number) => void;
  onSendFile: (file: File, caption?: string) => void;
  disabled?: boolean;
  sending?: boolean;
}

/* ── Timer display ───────────────────────────── */
function useTimer(active: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) { setSeconds(0); return; }
    const id = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return { display: `${m}:${s}`, seconds };
}

/* ── Waveform bars animation ─────────────────── */
function WaveformBars() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2.5, height: 20 }}>
      {[0.4, 0.7, 1, 0.6, 0.9, 0.5, 0.8, 0.45, 0.75, 1, 0.55, 0.85].map((h, i) => (
        <div key={i} style={{
          width: 3, borderRadius: 2,
          height: `${h * 100}%`,
          background: '#f87171',
          animation: `waveBar 0.8s ease-in-out ${i * 0.06}s infinite alternate`,
        }} />
      ))}
      <style>{`@keyframes waveBar { from{opacity:.4;transform:scaleY(.5)} to{opacity:1;transform:scaleY(1)} }`}</style>
    </div>
  );
}

export function MessageInput({ onSend, onSendAudio, onSendFile, disabled, sending }: MessageInputProps) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const textareaRef   = useRef<HTMLTextAreaElement>(null);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks   = useRef<Blob[]>([]);
  const streamRef     = useRef<MediaStream | null>(null);

  const { display: timerDisplay, seconds } = useTimer(recording);

  /* ── Text submit ─────────────────────────── */
  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled || sending) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    const el = textareaRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 130)}px`; }
  }

  function handlePickFile(event: React.ChangeEvent<HTMLInputElement>) {
    setFileError(null);
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/') && !file.type.startsWith('video/') && file.type !== 'application/pdf') {
      setFileError('Solo podés adjuntar fotos, videos o PDF');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setFileError('El archivo no puede superar 50 MB');
      return;
    }

    const caption = text.trim();
    onSendFile(file, caption || undefined);
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  /* ── Audio recording ─────────────────────── */
  const startRecording = useCallback(async () => {
    setAudioError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunks.current = [];

      // Prefer OGG/Opus (WhatsApp-native), fall back to webm
      const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const mr = new MediaRecorder(stream, { mimeType });
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.current.push(e.data); };
      mr.start(100);
      mediaRecorder.current = mr;
      setRecording(true);
    } catch {
      setAudioError('No se pudo acceder al micrófono');
    }
  }, []);

  const stopAndSend = useCallback(() => {
    const mr = mediaRecorder.current;
    if (!mr) return;
    const duration = seconds;

    mr.onstop = () => {
      const blob = new Blob(audioChunks.current, { type: mr.mimeType });
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        onSendAudio(base64, duration);
      };
      reader.readAsDataURL(blob);
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };

    mr.stop();
    setRecording(false);
  }, [onSendAudio, seconds]);

  const cancelRecording = useCallback(() => {
    mediaRecorder.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    audioChunks.current = [];
    setRecording(false);
  }, []);

  /* cleanup on unmount */
  useEffect(() => () => { cancelRecording(); }, [cancelRecording]);

  const canSend = !!text.trim() && !disabled && !sending;

  /* ── Render: recording mode ──────────────── */
  if (recording) {
    return (
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(6,6,12,0.98)', padding: '14px 24px 20px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'rgba(248,113,113,0.06)',
          border: '1px solid rgba(248,113,113,0.2)',
          borderRadius: 16, padding: '10px 14px',
        }}>
          {/* Cancel */}
          <button onClick={cancelRecording} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 0, flexShrink: 0, lineHeight: 1 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/>
            </svg>
          </button>

          {/* Waveform */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171', animation: 'recPulse 1s ease-in-out infinite', flexShrink: 0 }} />
            <WaveformBars />
          </div>

          {/* Timer */}
          <span style={{ fontSize: 13, fontWeight: 600, color: '#f87171', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
            {timerDisplay}
          </span>

          {/* Send */}
          <button onClick={stopAndSend} style={{
            width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #f87171, #ef4444)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            boxShadow: '0 2px 12px rgba(239,68,68,0.4)',
          }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="white">
              <path d="M5 3a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0z"/>
              <path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5"/>
            </svg>
          </button>
        </div>
        <style>{`@keyframes recPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.7)} }`}</style>
      </div>
    );
  }

  /* ── Render: normal mode ─────────────────── */
  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(6,6,12,0.98)', padding: '14px 24px 20px' }}>
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 8,
        background: 'rgba(255,255,255,0.04)',
        border: focused ? '1px solid rgba(24,93,232,0.5)' : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, padding: '8px 8px 8px 14px',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        boxShadow: focused ? '0 0 0 3px rgba(24,93,232,0.1)' : 'none',
      }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,application/pdf"
          onChange={handlePickFile}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || sending}
          title="Adjuntar foto, video o PDF"
          style={{
            width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
            cursor: disabled || sending ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, background: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.55)', transition: 'all 0.2s',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.5 3.5a3 3 0 0 1 6 0v7a2.5 2.5 0 0 1-5 0v-6a1 1 0 0 1 2 0v6a.5.5 0 0 0 1 0v-6a2 2 0 1 0-4 0v6a3.5 3.5 0 0 0 7 0v-7a4 4 0 0 0-8 0v7a.5.5 0 0 1-1 0z"/>
          </svg>
        </button>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Escribí un mensaje..."
          rows={1}
          disabled={disabled || sending}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            resize: 'none', fontSize: 13.5, lineHeight: 1.55, color: '#f0f0f5',
            fontFamily: 'inherit', letterSpacing: '0.01em',
            minHeight: 26, maxHeight: 130, paddingTop: 2,
          }}
        />

        {/* Mic button — only when no text typed */}
        {!text.trim() && (
          <button
            onClick={startRecording}
            disabled={disabled || sending}
            title="Grabar audio"
            style={{
              width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.5)', transition: 'all 0.2s',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
              <path d="M5 3a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0z"/>
              <path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5"/>
            </svg>
          </button>
        )}

        {/* Send button */}
        <button
          onClick={() => handleSubmit()}
          disabled={!canSend}
          style={{
            width: 36, height: 36, borderRadius: 10, border: 'none',
            cursor: canSend ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            background: canSend ? 'linear-gradient(135deg, #1e6aff, #185de8)' : 'rgba(255,255,255,0.06)',
            transition: 'all 0.2s',
            boxShadow: canSend ? '0 2px 12px rgba(24,93,232,0.4)' : 'none',
          }}
        >
          {sending ? (
            <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="white" style={{ opacity: canSend ? 1 : 0.3, transform: 'translateX(1px)' }}>
              <path d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.037a.5.5 0 0 1 .54.11z"/>
            </svg>
          )}
        </button>
      </div>

      {audioError && (
        <p style={{ fontSize: 11, color: '#f87171', marginTop: 6, paddingLeft: 2 }}>{audioError}</p>
      )}
      {fileError && (
        <p style={{ fontSize: 11, color: '#f87171', marginTop: 6, paddingLeft: 2 }}>{fileError}</p>
      )}

      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 7, paddingLeft: 2 }}>
        Enter para enviar · Shift+Enter para nueva línea
      </p>
      <style>{`@keyframes spin { to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}
