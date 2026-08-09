# SESSION-001 — Authenticated empty Canvas reconnaissance

- Date: 2026-08-09 (Asia/Shanghai)
- Surface: `https://www.liblib.tv/canvas?spaceId=4936973&projectId=ad68fc8234a14b50bce3391b8cc2ec86`
- Account state: authenticated, 20 visible credits at session entry
- Exploration policy: one Lead Explorer controls Browser; no private implementation inspection; no permission bypass

## Observation format

Each step records the user-visible contract:

- Trigger
- Input
- Resulting state
- Side effects
- Persisted data
- Loading state
- Success state
- Error state
- Recovery behavior

## Steps captured so far

### O001 — Direct project entry

- Evidence: E001, E002
- Trigger: open the supplied Canvas URL first while signed out, then after normal account login.
- Input: authorized project URL.
- Resulting state: signed-out access is gated; after login, the same URL opens an empty project named `未命名工作区` on `画布 1` in Workflow mode.
- Side effects: none observed.
- Persisted data: project identity and canvas identity are restored from the URL/account context.
- Loading state: not yet captured.
- Success state: empty canvas with starter task cards.
- Error state: not observed; unauthenticated access is a gate, not an error.
- Recovery behavior: normal login followed by reopening the URL restores access.

### O002 — Discover node creation options

- Evidence: E003, E004, E005
- Trigger: click the canvas `+` button and hover nested catalog rows.
- Input: none.
- Resulting state: a contextual catalog opens without leaving the canvas; Script and Asset Library reveal secondary choices.
- Side effects: no node is created until a leaf action is selected.
- Persisted data: none observed.
- Loading state: none observed.
- Success state: catalog and nested menus remain visible while choosing.
- Error state: none observed.
- Recovery behavior: clicking the `+` button again closes the catalog.

### O003 — Inspect Canvas and project assets

- Evidence: E006, E007
- Trigger: open `资产管理`, then switch from `画布` to `资产`.
- Input: none.
- Resulting state: a resizable left panel opens. Canvas and Assets use distinct information architectures and separate empty states.
- Side effects: viewport width available to the canvas decreases.
- Persisted data: panel-open persistence not yet tested.
- Loading state: none observed.
- Success state: Canvas shows zero nodes; Assets shows no personal assets.
- Error state: none observed.
- Recovery behavior: collapse control restores the full canvas width.

### O004 — Inspect Agent workspace and permissions

- Evidence: E008, E009
- Trigger: click `Agent`, then open Agent settings.
- Input: none.
- Resulting state: a resizable right panel shows suggested Skills and a composer. Settings show media-generation and notification permissions.
- Side effects: no generation or points usage occurred.
- Persisted data: the automatic image/video generation switch was already on when observed; persistence has not yet been tested.
- Loading state: none observed.
- Success state: Agent panel and settings modal open.
- Error state: browser notifications report a denied browser permission while the product setting exists.
- Recovery behavior: Cancel closes settings without saving changes.

