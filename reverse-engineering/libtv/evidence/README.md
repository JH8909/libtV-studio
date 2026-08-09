# LibTV Evidence Registry

All product conclusions in `spec/` and `benchmark/` must reference evidence IDs from this directory.

Evidence IDs are immutable once cited. Screenshots show only the visible state captured in the named session; they do not prove hidden implementation details.

| ID | File | Session | Observable claim |
| --- | --- | --- | --- |
| E001 | `screenshots/E001-access-gate.png` | SESSION-001 | Direct Canvas URL redirects an unauthenticated user to the LibTV home surface with a login entry. |
| E002 | `screenshots/E002-empty-canvas-entry.png` | SESSION-001 | An authenticated empty project opens in Workflow mode with four starter task cards and a persistent canvas toolbar. |
| E003 | `screenshots/E003-add-node-catalog.png` | SESSION-001 | The add-node catalog exposes Text, Image, Video, Smart Edit, Director, Frame Analysis, Audio, Script, Asset Library, Upload, and Generation History entry points. |
| E004 | `screenshots/E004-script-submenu.png` | SESSION-001 | Script exposes current and legacy script node variants. |
| E005 | `screenshots/E005-asset-library-submenu.png` | SESSION-001 | Asset Library exposes Style Library and Effects Library variants. |
| E006 | `screenshots/E006-canvas-elements-panel.png` | SESSION-001 | Asset Management has a Canvas tab with node count, type filter, search, and an explicit empty state. |
| E007 | `screenshots/E007-project-assets-empty.png` | SESSION-001 | Asset Management has an Assets tab split into Personal and Agent sources with search, filtering, and an explicit empty state. |
| E008 | `screenshots/E008-agent-panel.png` | SESSION-001 | Agent is a resizable right-side workspace with suggested Skills, notifications, prompt composer, attachments, model, Skill, and generation-mode controls. |
| E009 | `screenshots/E009-agent-settings.png` | SESSION-001 | Agent settings expose a human-safety agreement notice, automatic media generation permission, and browser notification controls. |

