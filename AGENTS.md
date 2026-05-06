# Codex — start here

This repo operates under a **strict stage state machine**. Before doing
*anything*, you must orient yourself.

## First action — ALWAYS, every session

```bash
python3 tests3/lib/stage.py probe
```

This prints the current stage + legal next stages + a one-line objective.

## Obey the stage

Each stage has an explicit contract at `tests3/stages/NN-<name>.md`
(objective, inputs, outputs, exit condition, **may NOT** list). Read it
before taking any action. If the user asks for something outside the
current stage's `may NOT` list, **refuse** with a stage-aware message:

> *"Currently in `<stage>`; that action is forbidden (`<rule>`). To do it,
> transition via `<legal next stage>`."*

## Common situations — map to stage

| user says                                    | likely stage                     |
|----------------------------------------------|----------------------------------|
| "debug X / fix Y / write code"               | `develop` (must be entered from `plan` or `triage`) |
| "run the tests / check the gate"             | `validate` (must be entered from `deploy`) |
| "classify failures / what broke"             | `triage` (entered from `validate` on red) |
| "validate checklist / sign off"              | `human` (entered from `validate` on green) |
| "ship it / merge to main"                    | `ship` (entered from `human`) |
| "start a new release / groom issues"         | `groom` (entered from `idle`) |

If the current stage doesn't match what the user asked for, **don't
bumble around trying to make it work**. State the mismatch and the
legal transition path.

## Why this matters (read `tests3/README.md` for the full model)

Vexa uses one nested-loop release protocol:

- **INNER** — validate → triage → develop → deploy → validate. Mechanical,
  cheap, repeats many times per day.
- **MIDDLE** — validate (green) → human (code review + eyeroll) → ship.
  Bounded human attention only.
- **OUTER** — ship → market → issues → groom. Slow, expensive, real users.

Drifting between stages destroys the Registry's regression guarantee
and the MIDDLE loop's boundedness. Your stage-awareness is the
enforcement.

## You are NOT the user

You may not mark `plan-approval.yaml`, `human-approval.yaml`, or any
stage's exit condition `approved: true` without the user explicitly
saying so in the current turn. Approval is a human signal — your job is
to prepare the material for it, not to grant it.

## If you're lost

`python3 tests3/lib/stage.py probe` again. Then read
`tests3/stages/<current>.md`. Then read `tests3/README.md`.

## Local Vexa helper CLIs on this machine

These are user-local wrapper scripts created for Will's local/self-hosted Vexa setup. They are not upstream Vexa commands. Do not print secrets; both helpers read credentials/tokens from local files.

### `vexa-meet` — manual bot control

Path:

```bash
/Users/am.will/.local/bin/vexa-meet
```

Purpose: start, inspect, stop, transcript, and note Google Meet bots against the local Vexa API gateway.

Useful commands:

```bash
# Show help
vexa-meet --help
vexa-meet start --help

# Start a Google Meet bot manually. Default bot name is "Will's Meeting Bot".
vexa-meet start https://meet.google.com/abc-defg-hij

# Start with the saved Google bot-account browser profile.
vexa-meet start --authenticated https://meet.google.com/abc-defg-hij

# Start with the standard lifecycle policy used for calendar auto-join.
vexa-meet start --authenticated \
  --name "Will's Meeting Bot" \
  --max-runtime-minutes 120 \
  --wait-for-admission-minutes 15 \
  --wait-for-humans-minutes 15 \
  --leave-after-alone-minutes 2 \
  --silence-timeout-minutes 60 \
  https://meet.google.com/abc-defg-hij

# Show currently running bots and their Vexa/meeting status.
vexa-meet status

# Stop a bot by Meet code or URL.
vexa-meet stop abc-defg-hij
vexa-meet stop https://meet.google.com/abc-defg-hij

# Fetch transcript for a Meet.
vexa-meet transcript abc-defg-hij

# Generate/save a local Markdown meeting note from the transcript.
vexa-meet note abc-defg-hij
```

Authenticated browser-session commands:

```bash
# Create/open a Vexa remote browser session for signing into the bot Google account.
vexa-meet auth-session

# After signing into the remote browser as amwill.catchall@gmail.com, save that browser storage.
vexa-meet auth-save <session_id>
```

Current intended bot account/name:

```text
Google bot account: amwill.catchall@gmail.com
Bot display name: Will's Meeting Bot
```

Current leave/lifecycle defaults sent by `vexa-meet start`:

```text
max runtime: 120 minutes
wait for admission: 15 minutes
wait for humans/no-show: 15 minutes
leave after bot is alone: 2 minutes
raw meeting-audio silence timeout: 60 minutes
no Calendar scheduled-end based leave
no transcript-silence based leave
```

### `vexa-calendar-watch` — local Calendar auto-join watcher

Path:

```bash
/Users/am.will/.local/bin/vexa-calendar-watch
```

Purpose: poll Google Calendar, find upcoming Google Meet events, and launch `vexa-meet start --authenticated ...` inside the join window. This is the local Option A watcher, not Vexa's unfinished upstream calendar-service.

Important files:

```text
Config: /Users/am.will/.hermes/vexa-calendar-watch/config.json
State:  /Users/am.will/.hermes/vexa-calendar-watch/state.json
Log:    /Users/am.will/.hermes/vexa-calendar-watch/watch.log
Token:  /Users/am.will/.hermes/vexa_calendar_token.json
LaunchAgent: /Users/am.will/Library/LaunchAgents/local.vexa-calendar-watch.plist
```

Useful commands:

```bash
# Show watcher config and last-run/state summary.
vexa-calendar-watch status

# Run one poll without launching anything.
vexa-calendar-watch once --dry-run

# Run one real poll. If an event is inside the join window, this launches the bot.
vexa-calendar-watch once

# Reset watcher state; useful before a test event so it can be launched again.
vexa-calendar-watch reset --all
```

Intended watcher config:

```json
{
  "enabled": true,
  "calendar_ids": ["primary"],
  "lookahead_hours": 48,
  "join_lead_minutes": 2,
  "late_grace_minutes": 5,
  "max_runtime_minutes": 120,
  "wait_for_admission_minutes": 15,
  "wait_for_humans_minutes": 15,
  "leave_after_alone_minutes": 2,
  "silence_timeout_minutes": 60,
  "bot_name": "Will's Meeting Bot",
  "authenticated": true
}
```

The watcher launch path is:

```text
Google Calendar event -> launchd local.vexa-calendar-watch every 60s -> vexa-calendar-watch once -> vexa-meet start --authenticated -> Vexa bot container
```

`local.vexa-calendar-watch` is live/enabled. It is a one-shot interval poller, so `launchctl print` normally shows `state = not running` between minute ticks; that is expected.

Known caveat/fix: the watcher launch path is proven. Google Meet admission detection must stay strict: do not claim the bot is active/admitted unless a real in-meeting signal such as visible `Leave call` is present; prejoin/waiting-room pages can expose misleading DOM. Do not claim the bot is in the host waiting room unless host UI or a live bot screenshot/log confirms it.

Speaker attribution policy: Google Meet DOM active-speaker signals are noisy. The local bot intentionally prefers unmapped/unknown speakers over wrong human names: Google Meet track→name locking now requires 6 exclusive-speaker votes at 90% consistency, overlap votes are ignored, and the participant-list-order fallback is disabled unless `VEXA_ENABLE_GMEET_PARTICIPANT_ORDER_FALLBACK=true` is explicitly set.

### `vexa-notes-watch` — local post-meeting notes automation

Path:

```bash
/Users/am.will/.local/bin/vexa-notes-watch
```

Purpose: after a Vexa bot leaves/completes, fetch the transcript, save the raw transcript, and run `codex exec` headlessly/non-interactively to generate a Markdown meeting summary, notes, decisions, and action items by person.

Output paths:

```text
Raw transcripts: /Users/am.will/Applications/transcripts/
Summary notes:   /Users/am.will/Documents/Meeting Notes/Vexa/
State:           /Users/am.will/.hermes/vexa-notes-watch/state.json
Log:             /Users/am.will/.hermes/vexa-notes-watch/watch.log
LaunchAgent:     /Users/am.will/Library/LaunchAgents/local.vexa-notes-watch.plist
```

Useful commands:

```bash
# Show notes watcher state.
vexa-notes-watch status

# Preview completed/launched meetings it would inspect.
vexa-notes-watch once --dry-run

# Run one real post-meeting notes pass.
vexa-notes-watch once

# Regenerate notes for a specific Meet code if needed.
vexa-notes-watch once --meet-code jhh-dvyp-dcf --force

# Reset notes state.
vexa-notes-watch reset jhh-dvyp-dcf
vexa-notes-watch reset --all
```

Automation policy:

```text
launchd runs `vexa-notes-watch once` every 60 seconds.
The script uses a lock file to avoid overlapping runs.
If a meeting is complete but transcript has 0 segments, it marks pending_transcript and retries later.
If notes already exist, it skips unless --force is used.
Codex command is non-interactive: codex exec --skip-git-repo-check --sandbox read-only --output-last-message <final-note-path> -
macOS/TCC pitfall: do not make launchd Python read/rewrite a Codex `.tmp` note in `~/Documents`; Codex writes the final `.md` directly and Python only checks exit code / metadata.
```
