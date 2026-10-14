import { useEffect, useState } from 'react';
import {
  speechController,
  SpeechControllerState,
  SpeechPlayOptions,
} from '../utils/speechController';

export function useSpeechController() {
  const [state, setState] = useState<SpeechControllerState>(() =>
    speechController.getState()
  );

  useEffect(() => {
    const unsubscribe = speechController.subscribe((newState) => {
      setState(newState);
    });
    return unsubscribe;
  }, []);

  return {
    ...state,
    play: (passageId: string, text: string, options?: SpeechPlayOptions) =>
      speechController.play(passageId, text, options),
    playChained: (
      passageId: string,
      utterances: SpeechSynthesisUtterance[],
      options?: { onEnd?: () => void; onError?: (err: string) => void }
    ) => speechController.playChained(passageId, utterances, options),
    pause: () => speechController.pause(),
    resume: () => speechController.resume(),
    stop: () => speechController.stop(),
    setRate: (rate: number) => speechController.setRate(rate),
    setLang: (lang: string) => speechController.setLang(lang),
  };
}
