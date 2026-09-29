# Calculus design system

## Direction

The interface is a working mathematician’s desk: a paper-white notebook sheet,
quiet graphite controls, and a continuous execution rail. It is an instrument,
not a dashboard. The rail is the defining visual and interaction device; it
connects cell order, execution count, and kernel state.

## Mode

Operate. Familiar notebook behavior, scanning speed, and keyboard flow outrank
decorative expression.

## Color

- Ink `#1C1E21`: primary text
- Paper `#FBFAF7`: notebook surface
- Chrome `#EFEEE9`: surrounding workspace
- Rule `#D9D7D0`: structure
- Cobalt `#2855D9`: primary action, focus, active execution
- Green `#247A52`: successful and ready state
- Vermilion `#B83A2F`: errors and destructive actions

Color is semantic. Cobalt does not decorate inactive content.

## Typography

- Manrope: interface labels and controls
- Literata: notebook titles and prose
- IBM Plex Mono: source, values, execution counters, and measurement

All three families are bundled locally. Prose measure stays below 70 characters
where possible. Notebook headings use Literata at a restrained fixed hierarchy;
the interface does not use promotional display scaling.

## Layout

```text
┌──────────────────────────────── top bar ────────────────────────────────┐
│ workspace rail │ execution timeline + notebook sheet │ variable panel │
└────────────────────────────────────────────────────────────────────────┘
```

The document column is left-aligned within a centered reading region. The
variable panel disappears first, then the workspace rail; the execution rail
survives on mobile because it carries meaning.

## Components and behavior

- Controls use a compact four-pixel radius and one-pixel structure.
- Cells have no permanent card treatment. Focus creates the cell boundary.
- Hover reveals secondary cell actions; keyboard focus reveals them too.
- Dynamic output uses an `aria-live` region.
- Errors name the failure and keep expandable tracebacks.
- Rich HTML runs in a sandboxed iframe.
- Structured tables remain native, sortable, filterable, and downloadable.
- The command palette is the compact access point for actions and local math queries.
- Motion communicates execution or drag state only and respects reduced motion.
- Dark mode preserves the same semantic color roles and restrained contrast.

## Responsive contract

- Above 1040px: workspace, notebook, and inspector
- 741–1040px: workspace and notebook
- 740px and below: notebook with compact top bar and execution rail

## Accessibility contract

All actions are keyboard reachable, focus is visibly cobalt, document structure
uses semantic headings and regions, controls have action-specific labels, state
is never communicated by color alone, and forced-colors mode retains focus and
execution markers.
