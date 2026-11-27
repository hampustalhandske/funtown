# The Queen speaks only when asked

The Queen is the town's face for the one steward session Funtown runs. No request goes to her
unless the user asks: one press of "Ask the Queen" is one request for her word on that card, and
one `POST /review` is one request for a PR review. Her word on every card by herself, or by herself
on high cards, was weighed and not taken.

The reasons: on 2026-11-17 the steward was sent 28 requests in 13 minutes that nobody asked for,
and the user's rule since is "reviews only on the user's request". Each word re-reads her whole
conversation, so cost grows with her context (estimated 7,000 input-token equivalents warm and up
to 364,000 cold per word), not with the number of cards.

## Consequences

- A card shows her word only when the user asked for it; Enter always takes the agent's pick.
- Her word and her reviews each have their own off switch (a prompt file, empty = off).
- Asking her on every card later is one setting on the same route, if the user wants it.
