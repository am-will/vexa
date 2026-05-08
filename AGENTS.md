# Vexa Local Agent Guide

This repo is Will's local/self-hosted Vexa workspace. The most important job for an agent here is knowing how to operate the local meeting automation without leaking secrets or disturbing running meetings.

## Repo Overview

- `services/vexa-bot/`: browser bot that joins Meet/Zoom/Teams, captures audio/captions, sends audio to transcription, and publishes transcript segments.
- `services/meeting-api/`: meeting/bot API and transcript retrieval.
- `services/runtime-api/`: launches bot containers.
- `services/transcription-service/`: local faster-whisper compatible transcription service and CPU load balancer.
- `deploy/compose/`: local compose stack.
- `services/vexa-bot/core/src/services/speaker-streams.ts`: per-speaker buffering, Whisper submission, turn finalization, and segment confirmation.

Local runtime-launched Google Meet bots should use:

```text
vexaai/vexa-bot:latest
```

After bot code changes, rebuild it:

```bash
cd /Users/am.will/Applications/vexa
cd services/vexa-bot/core && npm run build
cd /Users/am.will/Applications/vexa
docker build -t vexaai/vexa-bot:latest -f services/vexa-bot/Dockerfile services/vexa-bot
```

## Local Helper CLIs

These are user-local wrapper scripts, not upstream Vexa commands. They read credentials/tokens from local files. Do not print secrets.

### `vexa-meet`

Path:

```bash
/Users/am.will/.local/bin/vexa-meet
```

Use it for manual Google Meet bot control:

```bash
vexa-meet --help
vexa-meet start --help

# Start an authenticated bot with the standard lifecycle policy.
vexa-meet start --authenticated \
  --name "Will's Meeting Bot" \
  --max-runtime-minutes 120 \
  --wait-for-admission-minutes 15 \
  --wait-for-humans-minutes 15 \
  --leave-after-alone-minutes 2 \
  --silence-timeout-minutes 60 \
  https://meet.google.com/abc-defg-hij

# Inspect/stop/fetch transcript.
vexa-meet status
vexa-meet stop abc-defg-hij
vexa-meet transcript abc-defg-hij
vexa-meet transcript abc-defg-hij --json
vexa-meet note abc-defg-hij
```

Authenticated browser session helpers:

```bash
vexa-meet auth-session
vexa-meet auth-save <session_id>
```

Current intended bot identity:

```text
Google bot account: amwill.catchall@gmail.com
Bot display name: Will's Meeting Bot
```

## Calendar Auto-Join

Path:

```bash
/Users/am.will/.local/bin/vexa-calendar-watch
```

Purpose: poll Google Calendar, find upcoming Google Meet events, and launch `vexa-meet start --authenticated ...` inside the join window.

Important files:

```text
Config:      /Users/am.will/.hermes/vexa-calendar-watch/config.json
State:       /Users/am.will/.hermes/vexa-calendar-watch/state.json
Log:         /Users/am.will/.hermes/vexa-calendar-watch/watch.log
Token:       /Users/am.will/.hermes/vexa_calendar_token.json
LaunchAgent: /Users/am.will/Library/LaunchAgents/local.vexa-calendar-watch.plist
```

Useful commands:

```bash
vexa-calendar-watch status
vexa-calendar-watch once --dry-run
vexa-calendar-watch once
vexa-calendar-watch reset --all
```

Launch path:

```text
Google Calendar event
-> launchd local.vexa-calendar-watch every 60s
-> vexa-calendar-watch once
-> vexa-meet start --authenticated
-> Vexa bot container using vexaai/vexa-bot:latest
```

`local.vexa-calendar-watch` is a one-shot interval poller. `launchctl print` normally shows `state = not running` between minute ticks; that is expected. Check `runs` and `last exit code = 0`.

## Post-Meeting Notes Automation

Path:

```bash
/Users/am.will/.local/bin/vexa-notes-watch
```

Purpose: after a watcher-launched Vexa bot leaves/completes, fetch the transcript JSON, normalize it, save the raw transcript, and run `codex exec` headlessly to generate Markdown notes.

Output/state:

```text
Raw transcripts: /Users/am.will/Applications/transcripts/
Summary notes:   /Users/am.will/Documents/Meeting Notes/Vexa/
State:           /Users/am.will/.hermes/vexa-notes-watch/state.json
Log:             /Users/am.will/.hermes/vexa-notes-watch/watch.log
LaunchAgent:     /Users/am.will/Library/LaunchAgents/local.vexa-notes-watch.plist
```

Useful commands:

```bash
vexa-notes-watch status
vexa-notes-watch once --dry-run
vexa-notes-watch once
vexa-notes-watch once --meet-code abc-defg-hij --force
vexa-notes-watch reset abc-defg-hij
vexa-notes-watch reset --all
```

Automation policy:

```text
launchd runs `vexa-notes-watch once` every 60 seconds.
The script uses a lock file to avoid overlapping runs.
If a completed meeting has 0 transcript segments, it marks pending_transcript and retries later.
If notes already exist, it skips unless --force is used.
Codex writes directly to the final .md path with --output-last-message.
Python should only check exit code / metadata for files in ~/Documents because macOS TCC can block launchd Python there.
```

## Normalization And Captions

The notes watcher trusts deterministic transcript/caption evidence over LLM interpretation. The LLM only summarizes the normalized transcript.

Current behavior:

- Fetches `vexa-meet transcript <meet> --json`.
- Uses Vexa ASR segments as the base transcript.
- Aligns Google Meet caption events by time/text to correct speaker labels only when evidence is high-confidence.
- Filters caption events with epoch-like timestamps mixed into `relative_timestamp_ms`.
- Deduplicates Google Meet caption DOM revisions and drops partial revisions when a better later revision exists.
- Drops mixed-speaker composite captions when another known participant name appears inside the caption text.
- Adds caption-derived transcript lines when a caption line is clearly missing from Vexa ASR.

Example: if Vexa ASR misses `Will shall be going sixth` but Google Meet captions repeatedly captured it, the raw transcript should include a caption-derived line rather than letting the summary omit it.

Generated raw transcript docs include a `Speaker Normalization` section with:

```text
Caption events
Speaker labels changed
Caption/Vexa agreed
Caption-only lines added
```

The audit JSON lives beside the raw transcript:

```text
/Users/am.will/Applications/transcripts/<date title meet>.transcript.speaker-normalization.json
```

## Current Bot Transcript Policy

The local bot should avoid monolithic per-speaker segments:

- Flush on speaker inactivity, not simply because another speaker starts.
- Treat overlap as independent active speaker buffers.
- Close a speaker turn after 400ms of that speaker being quiet.
- If speakers overlap, keep both buffers open and let VAD/track source decide what audio each buffer receives.
- Prefer shorter unknown/ambiguous segments over confidently wrong names.

Implementation locations:

```text
services/vexa-bot/core/src/services/speaker-streams.ts
services/vexa-bot/core/src/index.ts
/Users/am.will/.local/bin/vexa-notes-watch
```

After editing `speaker-streams.ts` or `index.ts`, run:

```bash
cd services/vexa-bot/core && npm run build
docker build -t vexaai/vexa-bot:latest -f services/vexa-bot/Dockerfile services/vexa-bot
```

## Operational Checks

Use these before declaring the automation healthy:

```bash
vexa-meet status
vexa-calendar-watch status
vexa-calendar-watch once --dry-run
vexa-notes-watch status
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
docker image inspect vexaai/vexa-bot:latest --format '{{.Id}} {{.Created}}'
launchctl print gui/$(id -u)/local.vexa-calendar-watch
launchctl print gui/$(id -u)/local.vexa-notes-watch
```

Expected watcher state:

```text
local.vexa-calendar-watch: run interval = 60 seconds, last exit code = 0
local.vexa-notes-watch:    run interval = 60 seconds, last exit code = 0
```

If sandboxed commands cannot reach localhost, Docker, or `~/.hermes` lock files, rerun with appropriate local approval. This is common for `docker ps`, `curl localhost`, and watcher lock/state checks.

## Caveats

- Google Meet admission detection must stay strict. Do not claim active/admitted unless a real in-meeting signal such as visible `Leave call` is present.
- Prejoin/waiting-room pages can expose misleading DOM like participant IDs, self-name, mic/camera controls, or generic toolbars.
- `vexa-calendar-watch once --dry-run` records a preview only; it does not launch a bot.
- Google Meet captions are useful evidence, but they are noisy DOM revisions. Deduplicate and sanity-check timestamps before using them.
- Local Google Meet audio may be mixed rather than true per-participant channels. Overlap cannot be made perfect by buffering alone.
- Voiceprints are biometric data. Keep local, encrypt where possible, and get consent.
