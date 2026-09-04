'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Ditado do campo de pergunta — o microfone do protótipo (l.2988–2991).
 *
 * O protótipo desenha um balão de ÁUDIO com waveform e duração (l.2884–2900),
 * mas gravar e guardar áudio exigiria armazenamento e um provedor de
 * transcrição, que esta fase não tem (o assistente inteiro roda em driver
 * mock). O que dá para entregar de verdade é o ditado nativo do navegador:
 * a fala vira TEXTO no campo, e o usuário revisa antes de enviar.
 *
 * `supported === false` (Firefox, navegadores sem a API) esconde o botão —
 * um microfone que não escuta é exatamente o botão morto que a regra 2 proíbe.
 */

/** A API só existe prefixada no WebKit; o tipo não está no lib.dom padrão. */
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function useSpeechInput(onTranscript: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // A callback muda a cada render da página (fecha sobre o input); guardar em
  // ref evita reconstruir o reconhecedor — e perder a escuta em andamento.
  const callbackRef = useRef(onTranscript);
  callbackRef.current = onTranscript;

  // `supported` só pode ser decidido no cliente: no SSR não existe `window`,
  // e decidir no primeiro render causaria divergência de hidratação.
  useEffect(() => {
    setSupported(recognitionCtor() !== null);
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  const toggle = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    const Ctor = recognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = 'pt-BR';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, index) => {
        const alternatives = event.results[index];
        return alternatives?.[0]?.transcript ?? '';
      })
        .join(' ')
        .trim();
      if (transcript) callbackRef.current(transcript);
    };
    const finish = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognition.onerror = finish;
    recognition.onend = finish;

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, []);

  return { supported, listening, toggle };
}
