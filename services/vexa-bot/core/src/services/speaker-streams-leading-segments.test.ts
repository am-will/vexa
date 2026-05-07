import { SpeakerStreamManager } from './speaker-streams';

const SAMPLE_RATE = 16000;

function feedAudio(mgr: SpeakerStreamManager, speakerId: string, seconds: number): void {
  mgr.feedAudio(speakerId, new Float32Array(Math.floor(seconds * SAMPLE_RATE)).fill(0.1));
}

function testMultiSegmentWhisperResultEmitsStableLeadingSegmentsImmediately(): void {
  const confirmed: string[] = [];
  const mgr = new SpeakerStreamManager({
    sampleRate: SAMPLE_RATE,
    minAudioDuration: 1,
    submitInterval: 1,
    confirmThreshold: 2,
    maxBufferDuration: 30,
    idleTimeoutSec: 15,
  });

  mgr.onSegmentConfirmed = (_id, _name, text) => {
    confirmed.push(text);
  };

  mgr.addSpeaker('s1', 'Alice');
  feedAudio(mgr, 's1', 12);
  mgr.handleTranscriptionResult(
    's1',
    'First complete sentence. Second complete sentence. Third still forming',
    12,
    [
      { text: 'First complete sentence.', start: 0, end: 3 },
      { text: 'Second complete sentence.', start: 3.2, end: 6 },
      { text: 'Third still forming', start: 6.2, end: 12 },
    ],
  );

  if (confirmed.length !== 2 || confirmed[0] !== 'First complete sentence.' || confirmed[1] !== 'Second complete sentence.') {
    throw new Error(`expected two stable leading segments, got ${JSON.stringify(confirmed)}`);
  }
  mgr.removeAll();
}

testMultiSegmentWhisperResultEmitsStableLeadingSegmentsImmediately();
console.log('speaker-streams leading segment tests passed');
