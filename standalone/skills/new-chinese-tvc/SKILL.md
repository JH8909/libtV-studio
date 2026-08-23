---
name: new-chinese-tvc
description: Use the project's Agent and canvas to create a 15-second 16:9 new-Chinese product TVC from a product image and selling points, including anchors, five-shot storyboard, keyframes, first-frame videos, voiceover/music plans, and timeline assembly.
metadata:
  short-description: Create a structured new-Chinese product TVC
---

# New Chinese TVC

This is the project-local executable Skill definition for the Agent and Skill Plaza. It is explicitly selected by the user before it can modify the canvas or start generation.

The Skill follows the QUill method: establish a continuity bible first, convert it into a five-shot 15-second storyboard, generate a keyframe for every shot, generate each shot from its keyframe, prepare voiceover and music plans, and append successful visual shots to the Timeline.

The fixed shot arc is:

1. Establish the cloud-sea world and emotional hook.
2. Reveal the subject and styling with a slow turn.
3. Show the product in a macro usage detail.
4. Create a restrained facial/emotional response.
5. End with the subject and product together in a quiet brand frame.

The product image is a continuity reference. The implementation must not alter the product's structure, material, color, decoration, count, or identity. Every shot must have one main purpose, one continuous action chain, explicit duration, and stable character/scene/light anchors.

The current Standalone provider layer can generate text, images, and videos. It preserves audio.tts and audio.music as plan stages and uses the video provider's complete-audio mode when available; actual separate audio generation becomes executable when an audio provider adapter is added or an audio asset is uploaded.
