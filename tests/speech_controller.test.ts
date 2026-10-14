import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SpeechController } from '../src/utils/speechController';

// Mock Web Speech API
class MockSpeechSynthesisUtterance {
  public text: string;
  public rate = 1.0;
  public lang = 'en-US';
  public onstart: ((e?: any) => void) | null = null;
  public onpause: ((e?: any) => void) | null = null;
  public onresume: ((e?: any) => void) | null = null;
  public onend: ((e?: any) => void) | null = null;
  public onerror: ((e?: any) => void) | null = null;
  public onboundary: ((e?: any) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

class MockSpeechSynthesis {
  public speaking = false;
  public paused = false;
  public pending = false;
  public speakCalls: MockSpeechSynthesisUtterance[] = [];
  public pauseCalls = 0;
  public resumeCalls = 0;
  public cancelCalls = 0;

  public speak(utterance: MockSpeechSynthesisUtterance) {
    this.speakCalls.push(utterance);
    this.speaking = true;
    this.paused = false;
  }

  public pause() {
    this.pauseCalls++;
    this.paused = true;
    this.speaking = false;
    const last = this.speakCalls[this.speakCalls.length - 1];
    last?.onpause?.();
  }

  public resume() {
    this.resumeCalls++;
    this.paused = false;
    this.speaking = true;
    const last = this.speakCalls[this.speakCalls.length - 1];
    last?.onresume?.();
  }

  public cancel() {
    this.cancelCalls++;
    this.speaking = false;
    this.paused = false;
  }
}

describe('SpeechController Unit Tests', () => {
  let mockSynth: MockSpeechSynthesis;
  let controller: SpeechController;

  beforeEach(() => {
    mockSynth = new MockSpeechSynthesis();
    (globalThis as any).window = {
      speechSynthesis: mockSynth,
      SpeechSynthesisUtterance: MockSpeechSynthesisUtterance,
    };
    (globalThis as any).SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
    controller = new SpeechController();
  });

  test('1. Play starts a speech utterance', () => {
    controller.play('passage-1', 'What is Photosynthesis?');

    assert.equal(mockSynth.speakCalls.length, 1);
    assert.equal(mockSynth.speakCalls[0].text, 'What is Photosynthesis?');
    assert.equal(controller.getState().playbackState, 'speaking');
    assert.equal(controller.getState().currentPassageId, 'passage-1');
  });

  test('2. Pause calls the browser pause API and sets state to paused', () => {
    controller.play('passage-1', 'What is Photosynthesis?');
    assert.equal(controller.getState().playbackState, 'speaking');

    controller.pause();

    assert.equal(mockSynth.pauseCalls, 1);
    assert.equal(controller.getState().playbackState, 'paused');
    assert.equal(controller.getState().currentPassageId, 'passage-1');
  });

  test('3. Resume calls the browser resume API without creating a second utterance', () => {
    controller.play('passage-1', 'What is Photosynthesis?');
    controller.pause();
    assert.equal(mockSynth.speakCalls.length, 1);

    controller.resume();

    assert.equal(mockSynth.resumeCalls, 1);
    // CRITICAL: No second utterance should be created
    assert.equal(mockSynth.speakCalls.length, 1);
    assert.equal(controller.getState().playbackState, 'speaking');
    assert.equal(controller.getState().currentPassageId, 'passage-1');
  });

  test('4. Stop cancels playback and resets state', () => {
    controller.play('passage-1', 'What is Photosynthesis?');
    assert.equal(controller.getState().playbackState, 'speaking');

    controller.stop();

    assert.ok(mockSynth.cancelCalls >= 1);
    assert.equal(controller.getState().playbackState, 'idle');
    assert.equal(controller.getState().currentPassageId, null);
    assert.equal(controller.getState().currentText, null);
  });

  test('5. A new passage replaces the previous utterance without audio overlap', () => {
    controller.play('passage-A', 'First question text');
    assert.equal(controller.getState().currentPassageId, 'passage-A');
    const cancelCountBefore = mockSynth.cancelCalls;

    controller.play('passage-B', 'Second question text');

    // Previous speech must be cancelled
    assert.ok(mockSynth.cancelCalls > cancelCountBefore);
    assert.equal(mockSynth.speakCalls.length, 2);
    assert.equal(mockSynth.speakCalls[1].text, 'Second question text');
    assert.equal(controller.getState().currentPassageId, 'passage-B');
    assert.equal(controller.getState().playbackState, 'speaking');
  });

  test('6. Speech ending resets the controls to idle', () => {
    controller.play('passage-1', 'Short sentence.');
    assert.equal(controller.getState().playbackState, 'speaking');

    // Simulate utterance end event
    const utterance = mockSynth.speakCalls[0];
    utterance.onend?.();

    assert.equal(controller.getState().playbackState, 'idle');
    assert.equal(controller.getState().currentPassageId, null);
  });

  test('7. Speech errors do not leave the controls stuck', () => {
    controller.play('passage-err', 'Problematic sentence.');
    assert.equal(controller.getState().playbackState, 'speaking');

    // Simulate utterance error event
    const utterance = mockSynth.speakCalls[0];
    utterance.onerror?.({ error: 'audio-busy' } as any);

    assert.equal(controller.getState().playbackState, 'error');
    assert.equal(controller.getState().error, 'audio-busy');

    // Recovering by calling stop resets state
    controller.stop();
    assert.equal(controller.getState().playbackState, 'idle');
  });

  test('8. Both Normal Mode and Dyslexia Mode use the shared working controls', () => {
    let observedState = controller.getState();
    const unsubscribe = controller.subscribe((s) => {
      observedState = s;
    });

    // Start playback representing Normal Mode
    controller.play('quiz-question-101', 'Calculate force if mass is 5kg.');
    assert.equal(observedState.playbackState, 'speaking');
    assert.equal(observedState.currentPassageId, 'quiz-question-101');

    // Pause in Dyslexia Mode
    controller.pause();
    assert.equal(observedState.playbackState, 'paused');

    // Resume in Normal Mode
    controller.resume();
    assert.equal(observedState.playbackState, 'speaking');

    unsubscribe();
  });

  test('9. Unsupported browser behavior is handled gracefully', () => {
    (globalThis as any).window = {};
    const unsuppController = new SpeechController();

    assert.equal(unsuppController.isSupported(), false);

    unsuppController.play('passage-x', 'Will not speak');
    assert.equal(unsuppController.getState().playbackState, 'error');
    assert.ok(
      unsuppController.getState().error?.includes('not supported')
    );
  });

  test('10. Changing modes does not produce overlapping speech', () => {
    // Dyslexia mode plays with custom speed
    controller.play('quiz-question-1', 'Question one text', { rate: 0.85 });
    assert.equal(mockSynth.speakCalls.length, 1);
    assert.equal(mockSynth.speakCalls[0].rate, 0.85);

    // Switch to Normal Mode: since the passage ID is the same, no new utterance is forced
    const state = controller.getState();
    assert.equal(state.currentPassageId, 'quiz-question-1');
    assert.equal(state.playbackState, 'speaking');
    // Still exactly 1 utterance in flight
    assert.equal(mockSynth.speakCalls.length, 1);
  });

  test('11. Chained question and options playback supports pause, resume, and sequential playback', () => {
    const u1 = new MockSpeechSynthesisUtterance('Question 1: What is 2 + 2?') as any;
    const u2 = new MockSpeechSynthesisUtterance('Option A: 3') as any;
    const u3 = new MockSpeechSynthesisUtterance('Option B: 4') as any;

    controller.playChained('quiz-question-2', [u1, u2, u3]);

    assert.equal(mockSynth.speakCalls.length, 1);
    assert.equal(mockSynth.speakCalls[0].text, 'Question 1: What is 2 + 2?');
    assert.equal(controller.getState().playbackState, 'speaking');

    // Pause during question
    controller.pause();
    assert.equal(controller.getState().playbackState, 'paused');
    assert.equal(mockSynth.pauseCalls, 1);

    // Resume continues current question without new utterance
    controller.resume();
    assert.equal(controller.getState().playbackState, 'speaking');
    assert.equal(mockSynth.resumeCalls, 1);
    assert.equal(mockSynth.speakCalls.length, 1);

    // Question ends, auto-advances to Option A
    u1.onend?.();
    assert.equal(mockSynth.speakCalls.length, 2);
    assert.equal(mockSynth.speakCalls[1].text, 'Option A: 3');

    // Option A ends, auto-advances to Option B
    u2.onend?.();
    assert.equal(mockSynth.speakCalls.length, 3);
    assert.equal(mockSynth.speakCalls[2].text, 'Option B: 4');

    // Option B ends, chain completes and resets to idle
    u3.onend?.();
    assert.equal(controller.getState().playbackState, 'idle');
    assert.equal(controller.getState().currentPassageId, null);
  });
});
