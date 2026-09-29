# Calculus product definition

## Purpose

Calculus is a personal computational notebook for people who want to explore
mathematics, data, and small scientific programs without setting up a Python
environment. Its primary job is to keep thought, code, and output in one calm,
durable document.

## Primary users

- Students working through mathematics and scientific computing
- Engineers and researchers testing small models or transformations
- Curious technical users who want a local notebook without a hosted account

## Product principles

1. The notebook is the workspace. Application chrome stays secondary.
2. Local work should be immediate and private by default.
3. Every execution state must be visible and recoverable.
4. Standard notebook skills transfer: cells, run-and-advance, Markdown, and
   `.ipynb` interoperability behave as experienced users expect.
5. Mathematical output should read like typeset work, not console debris.

## v2 boundary

Version 2 provides a complete local notebook with Math.js, browser-hosted
Python, reactive widgets, dependency-aware editing, native desktop packaging,
and an optional self-hosted collaboration service. Its local interpreter turns
a focused set of natural-language math requests into inspectable cells. It does
not claim Wolfram Language compatibility, arbitrary natural-language knowledge,
remote compute, or parity with the Wolfram knowledge engine.

## Success criteria

A new user can open the app, evaluate the starter notebook, add a Python cell,
see a rich result, close the app, return to the saved notebook, search or export
it, and optionally sync a version without reading external documentation.
