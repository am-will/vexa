import assert from 'node:assert/strict';
import {
  GoogleMeetCaptionAccumulator,
  normalizeGoogleMeetCaptionEvent,
} from './captions';

function testNormalizesCaptionEvents() {
  const event = normalizeGoogleMeetCaptionEvent(
    ' Jordan Smith ',
    '  Can you pull up the report?  ',
    12_500,
    10_000,
    "Will's Meeting Bot",
  );

  assert.deepEqual(event, {
    event_type: 'CAPTION_TEXT',
    participant_name: 'Jordan Smith',
    caption_text: 'Can you pull up the report?',
    relative_timestamp_ms: 2500,
    source: 'google_meet_captions',
  });
}

function testRejectsBotAndUiCaptionNoise() {
  assert.equal(
    normalizeGoogleMeetCaptionEvent("Will's Meeting Bot", 'hello', 1000, 0, "Will's Meeting Bot"),
    null,
  );
  assert.equal(
    normalizeGoogleMeetCaptionEvent('Turn on captions', 'hello', 1000, 0),
    null,
  );
  assert.equal(
    normalizeGoogleMeetCaptionEvent('Jordan Smith', '   ', 1000, 0),
    null,
  );
  assert.equal(
    normalizeGoogleMeetCaptionEvent('keyboard_arrow_up', 'Audio settings mic_off Turn on microphone (ctrl + d)', 1000, 0),
    null,
  );
  assert.equal(
    normalizeGoogleMeetCaptionEvent('format_size', 'Font size circle Font color settings Open caption settings', 1000, 0),
    null,
  );
  assert.equal(
    normalizeGoogleMeetCaptionEvent('4:14', 'AM Normalization test Normalization test', 1000, 0),
    null,
  );
  assert.equal(
    normalizeGoogleMeetCaptionEvent('Normalization test', 'Normalization test', 1000, 0),
    null,
  );
}

function testAccumulatorCoalescesPartialCaptionUpdates() {
  const accumulator = new GoogleMeetCaptionAccumulator(100);

  accumulator.add('Jordan Smith', 'Can you', 10_000, 0);
  accumulator.add('Jordan Smith', 'Can you pull up', 10_800, 0);
  accumulator.add('Jordan Smith', 'Can you pull up the report?', 11_200, 0);

  assert.deepEqual(accumulator.snapshot(), [
    {
      event_type: 'CAPTION_TEXT',
      participant_name: 'Jordan Smith',
      caption_text: 'Can you pull up the report?',
      relative_timestamp_ms: 10_000,
      source: 'google_meet_captions',
    },
  ]);
}

function testAccumulatorStartsNewEventOnSpeakerChange() {
  const accumulator = new GoogleMeetCaptionAccumulator(100);

  accumulator.add('Jordan Smith', 'Can you pull up the report?', 10_000, 0);
  accumulator.add('Will Ryan', 'Yep, one second.', 12_000, 0);

  assert.equal(accumulator.snapshot().length, 2);
  assert.equal(accumulator.snapshot()[1].participant_name, 'Will Ryan');
}

function run() {
  testNormalizesCaptionEvents();
  testRejectsBotAndUiCaptionNoise();
  testAccumulatorCoalescesPartialCaptionUpdates();
  testAccumulatorStartsNewEventOnSpeakerChange();
  console.log('googlemeet captions tests passed');
}

run();
