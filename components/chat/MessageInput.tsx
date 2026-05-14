'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface MessageInputProps {
  onSend: (text: string) => void;
  onSendAudio: (base64: string, duration: number) => void;
  onSendFile: (file: File, caption?: string) => void;
  draftText?: string;
  onDraftConsumed?: () => void;
  onBudget?: () => void;
  botPaused?: boolean;
  onResumeBot?: () => void;
  disabled?: boolean;
  sending?: boolean;
}

function useTimer(active: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) { setSeconds(0); return; }
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  return { display: `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`, seconds };
}

const toolbarButton: React.CSSProperties = {
  border: '1px solid var(--line)',
  background: 'rgba(255,255,255,0.025)',
  color: 'var(--text-3)',
  borderRadius: 999,
  padding: '7px 10px',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 650,
};

export function MessageInput({
  onSend,
  onSendAudio,
  onSendFile,
  draftText,
  onDraftConsumed,
  onBudget,
  botPaused,
  onResumeBot,
  disabled,
  sending,
}: MessageInputProps) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const { display: timerDisplay, seconds } = useTimer(recording);

  useEffect(() => {
    if (!draftText) return;
    setText(draftText);
    onDraftConsumed?.();
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
      }
    });
  }, [draftText, onDraftConsumed]);

  function resetTextarea() {
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled || sending) return;
    onSend(trimmed);
    resetTextarea();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }
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
    onSendFile(file, text.trim() || undefined);
    resetTextarea();
  }

  const startRecording = useCallback(async () => {
    setAudioError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunks.current = [];
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
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
    mr.stop();
    setRecording(false);
  }, [onSendAudio, seconds]);

  const cancelRecording = useCallback(() => {
    mediaRecorder.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    audioChunks.current = [];
    setRecording(false);
  }, []);

  useEffect(() => () => { cancelRecording(); }, [cancelRecording]);

  const canSend = !!text.trim() && !disabled && !sending;

  if (recording) {
    return (
      <div style={{ borderTop: '1px solid var(--line)', background: 'var(--ink-1)', padding: '14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid rgba(255,107,107,0.25)', background: 'var(--hot-soft)', borderRadius: 'var(--radius-lg)', padding: '12px 14px' }}>
          <button aria-label="Cancelar audio" onClick={cancelRecording} className="scala-button">Cancelar</button>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--hot)', animation: 'recPulse 1s ease-in-out infinite' }} />
          <span style={{ flex: 1, color: 'var(--hot)', fontWeight: 700, fontSize: 13 }}>Grabando audio</span>
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{timerDisplay}</span>
          <button onClick={stopAndSend} className="scala-button scala-button-primary">Enviar audio</button>
        </div>
        <style>{`@keyframes recPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.7)} }`}</style>
      </div>
    );
  }

  return (
    <div style={{ borderTop: '1px solid var(--line)', background: 'var(--ink-1)', padding: '14px 18px 16px' }}>
      {botPaused && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(255,174,92,0.24)', background: 'var(--warm-soft)', borderRadius: 'var(--radius-md)', padding: '9px 12px', marginBottom: 10 }}>
          <span style={{ color: 'var(--warm)', fontSize: 13, fontWeight: 700 }}>Sentinel pausado</span>
          <button type="button" className="scala-button" onClick={onResumeBot}>Reactivar Sentinel</button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <input ref={fileInputRef} type="file" accept="image/*,video/*,application/pdf" onChange={handlePickFile} style={{ display: 'none' }} />
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={disabled || sending} style={toolbarButton}>Adjuntar</button>
        <button type="button" style={toolbarButton}>Plantillas</button>
        <button type="button" onClick={onBudget} style={toolbarButton}>Presupuesto</button>
        <button type="button" style={toolbarButton}>Agendar</button>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={startRecording} disabled={disabled || sending} style={toolbarButton}>Audio</button>
      </div>

      <form onSubmit={handleSubmit} style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 10,
        background: 'var(--ink-3)',
        border: focused ? '1px solid rgba(96,165,250,0.42)' : '1px solid var(--line)',
        borderRadius: 'var(--radius-lg)',
        padding: '11px 11px 11px 14px',
        boxShadow: focused ? '0 0 0 4px rgba(37,99,235,0.12)' : 'none',
      }}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Escribí un mensaje... (Tab para usar sugerencia 1)"
          rows={1}
          disabled={disabled || sending}
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', resize: 'none', fontSize: 14, lineHeight: 1.55, color: 'var(--text)', fontFamily: 'var(--sans)', minHeight: 26, maxHeight: 140 }}
        />
        <button aria-label="Enviar mensaje" type="submit" disabled={!canSend} style={{ minWidth: 72, height: 40, borderRadius: 12, border: 'none', background: canSend ? 'var(--blue)' : 'var(--ink-4)', color: canSend ? 'white' : 'var(--text-4)', cursor: canSend ? 'pointer' : 'default', display: 'grid', placeItems: 'center', fontWeight: 700 }}>
          {sending ? '...' : 'Enviar'}
        </button>
      </form>

      {(audioError || fileError) && <p style={{ color: 'var(--hot)', fontSize: 12, margin: '8px 0 0' }}>{audioError || fileError}</p>}
      <p style={{ fontSize: 11, color: 'var(--text-4)', margin: '8px 2px 0', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span>Enter enviar · Shift+Enter nueva línea · Tab sugerencia</span>
        <span>Sentinel <b style={{ color: 'var(--green)' }}>retomará</b> luego de tu mensaje</span>
      </p>
    </div>
  );
}
