---
name: cinematic-vfx-creator
description: Use the Agent and canvas to create a cinematic fighting or VFX video from one instruction, with optional image or video reference and Timeline append.
metadata:
  short-description: Create character fighting VFX clips from one instruction
---

# Cinematic VFX Creator

This project-local Skill adapts the LiblibTV “影视打斗特效skill” into an executable Agent workflow. The user explicitly selects it, writes one creative instruction, and may attach an image or video reference.

The fixed flow is:

1. Extract the character, action chain, effect elements, scene, camera, emotion, and continuity constraints.
2. Create a concise action-and-VFX breakdown node.
3. Create one video node using text-to-video, image-to-video, or reference-video capability based on the attached reference.
4. Generate the clip with clear action-triggered effects and continuity constraints.
5. Append a successful video result to the Timeline.

The Skill must not invent unrequested characters or story beats, alter the subject identity, or introduce random face changes, costume changes, body deformation, clipping, or unrequested cuts. The source Skill describes 15–30 second outputs; the local provider adapter may generate one supported segment (usually 5/8/10 seconds), which can be extended or assembled later on the Timeline.

The Skill Plaza keeps the source cover and public example videos as remote media references. Their detail cards provide inline preview and a download action without adding large media files to the repository.
