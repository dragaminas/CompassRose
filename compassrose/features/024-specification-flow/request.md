# Request: Specification Flow

I want a specification flow that settles, together with me, a set of features with their
specifications — features that cover every dimension of the application, defined according to my
competencies, and filled in with the agent's knowledge everywhere I am not equipped to specify.

This flow does not always start from zero. It evaluates whether the project already has CompassRose
initialized and finds the features that have not been formalized yet. If there is nothing pending
formalization, it asks me to state the feature or the bug, and enters a specification cycle that
leaves it settled.

Specification is a conversation, never a document the AI writes alone for me to rubber-stamp. The
automated flow must only ever run on features and bugs that are documented and validated by a
specification produced this way.

Three things this flow must get right, which today's `brainstorm` does not:

- **It must see unformalized requests.** Today it only looks for items awaiting *validation*, so a
  folder holding just `request.md` is invisible to it. This repository has eighteen of those.
- **It must cover the dimensions of the application, not just what I happened to mention.** A
  declared list of dimensions is the reproducible floor. The agent may propose dimensions that list
  does not contemplate, but a proposed dimension is never added on its own: I accept it — and it
  joins the declared list — or I discard it with a reason, and it is not proposed again.
- **It must know what I am equipped to decide.** I declare, per session, whether I decide product,
  architecture, and implementation detail, or whether the agent fills each in. That profile belongs
  to the person in the session, never to the repository: another person with different competencies
  must not inherit mine.

Decisions about the project are inherited between sessions and can always be reopened. Competencies
are never inherited.

## Origin

Specified jointly with the user in the specification round of 2026-08-22. Supersedes and absorbs
requests `005-feature-request-intake` and `006-feature-formalization`, and takes over the
formalization responsibility previously held by the automated loop.
