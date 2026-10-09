# AANYA 3D Model Directory

Place your rigged humanoid GLB model here named:
`AANYA.glb`

When placed here at `/models/AANYA.glb`, `AvatarView` and `ThreeAvatarScene` will automatically detect and load it on startup, binding:
1. **Bones**: Head, Neck, Spine, LeftEye, RightEye, LeftArm, RightArm, LeftHand, RightHand.
2. **Morph Targets / Blendshapes**:
   - `eyeBlinkLeft`, `eyeBlinkRight` (procedural natural blinking)
   - `jawOpen`, `viseme_aa`, `mouthOpen`, `viseme_O`, `viseme_U` (real-time voice lip sync)
   - `mouthSmile`, `browInnerUp`, `browDownLeft`, `browDownRight` (emotion expressions)
3. **Animations**: Idle breathing, talking, waving, nodding, gesturing.
