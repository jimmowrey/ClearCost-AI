# Operating Manual

> Status: placeholder. Structure only — expand in the documentation sprint.

## Purpose

How to run, test, and operate ClearCost AI during development.

## Prerequisites

<!-- TODO: document Node version, tooling, and any setup steps. -->

- Node.js (see repository tooling for the supported version).

## Running the application

<!-- TODO: document how to launch the front-end / app surface. -->

## Running tests

- Node regression tests run directly: `node tests/<name>.mjs`.
- Tests are deterministic and require no network access.
- Establish the current pass/fail baseline before changing code.

## Branch & commit workflow

See `CLAUDE.md` (Branch Policy, Commit Policy). Summary:

1. Verify branch with `git branch --show-current`.
2. Keep changes in scope; one logical change per commit.
3. Never modify `main` without explicit approval.

## Release process

<!-- TODO: define once a versioning scheme is adopted (see Roadmap). -->

## Troubleshooting

<!-- TODO -->
