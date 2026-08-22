# Request: Terminal Session

I want CompassRose to be used the way Claude Code is used: one terminal session that you open and talk to, not a set of batch scripts you invoke one at a time.

Today the product surface is six separate npm scripts (`setup`, `brainstorm`, `feature-validation`, `app`, `doctor`, `acknowledge-blocker`). Each one takes the terminal, does its job, and exits. Nothing is continuous, nothing is interruptible, and understanding what happened means going to read a document afterwards.

The session should be:

- **one entry point**: running `compassrose` with no arguments opens an interactive session
- **conversational**: I describe what I want in plain language and the agent answers, asks, and helps me specify
- **deterministic where it counts**: conversation never changes state on its own. Creating a feature, starting the loop, unblocking — every state transition needs an explicit command from me, never the model's judgment
- **live**: when the automated loop runs, it runs inside the session and I watch each step land as it happens
- **interruptible**: I can stop the loop at a clean step boundary and get the prompt back, with state saved
- **legible at the point of failure**: when something fails, the explanation happens in the conversation, in human language, and I can ask "why?" or "what now?" right there

Non-interactive invocation must survive for CI and scripting, the way `claude -p` does.

The terminal is the interface. There is no GUI in scope here.

## Origin

Specified jointly with the user in the specification round of 2026-08-22, after the self-hosting
loop stalled and the six-script surface was judged opaque. Supersedes the CLI-surface portions of
requests `019-autonomous-execution-modes` and `020-self-application`.
