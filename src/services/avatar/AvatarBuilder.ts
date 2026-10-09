import * as THREE from 'three';
import { EmotionType, GestureType } from './EmotionActionEngine';
import { LipSyncParams } from './LipSyncEngine';

export interface AvatarBones {
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Mesh;
  chest: THREE.Mesh;
  headGroup: THREE.Group;
  head: THREE.Mesh;
  hairGroup: THREE.Group;
  eyesGroup: THREE.Group;
  leftEye: THREE.Mesh;
  rightEye: THREE.Mesh;
  leftEyelid: THREE.Mesh;
  rightEyelid: THREE.Mesh;
  leftPupil: THREE.Mesh;
  rightPupil: THREE.Mesh;
  leftEyebrow: THREE.Mesh;
  rightEyebrow: THREE.Mesh;
  nose: THREE.Mesh;
  mouthGroup: THREE.Group;
  upperLip: THREE.Mesh;
  lowerLip: THREE.Mesh;
  mouthCavity: THREE.Mesh;
  leftEar: THREE.Mesh;
  rightEar: THREE.Mesh;
  neck: THREE.Mesh;
  leftShoulder: THREE.Group;
  rightShoulder: THREE.Group;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  leftForearm: THREE.Group;
  rightForearm: THREE.Group;
  leftHand: THREE.Mesh;
  rightHand: THREE.Mesh;
}

export class AvatarBuilder {
  public static build(themeColorHex: string = '#ec4899'): { root: THREE.Group; bones: AvatarBones; materials: Record<string, THREE.Material> } {
    const root = new THREE.Group();
    root.name = 'AanyaAvatar';

    // Materials
    const skinColor = new THREE.Color(0xffdfcb); // warm radiant skin
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: skinColor,
      roughness: 0.55,
      metalness: 0.05,
    });

    const blushMaterial = new THREE.MeshStandardMaterial({
      color: 0xff8ca3,
      roughness: 0.7,
      transparent: true,
      opacity: 0.45,
    });

    const hairColor = new THREE.Color(0x1a0f1d); // deep dark violet-black hair
    const hairMaterial = new THREE.MeshStandardMaterial({
      color: hairColor,
      roughness: 0.4,
      metalness: 0.1,
    });

    const highlightColor = new THREE.Color(themeColorHex);
    const cyberHighlightMaterial = new THREE.MeshStandardMaterial({
      color: highlightColor,
      emissive: highlightColor,
      emissiveIntensity: 0.35,
      roughness: 0.3,
    });

    const clothMaterial = new THREE.MeshStandardMaterial({
      color: 0x14121e,
      roughness: 0.6,
      metalness: 0.2,
    });

    const clothTrimMaterial = new THREE.MeshStandardMaterial({
      color: highlightColor,
      emissive: highlightColor,
      emissiveIntensity: 0.4,
      roughness: 0.2,
    });

    const eyeWhiteMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const irisMaterial = new THREE.MeshStandardMaterial({
      color: highlightColor,
      emissive: highlightColor,
      emissiveIntensity: 0.4,
      roughness: 0.15,
    });
    const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x0a0a0f });
    const eyeLidMaterial = new THREE.MeshStandardMaterial({
      color: skinColor,
      roughness: 0.5,
    });

    const lipMaterial = new THREE.MeshStandardMaterial({
      color: 0xd9436d,
      roughness: 0.3,
      metalness: 0.1,
    });

    const mouthInsideMaterial = new THREE.MeshBasicMaterial({ color: 0x24060e });

    // Hierarchy Groups
    const body = new THREE.Group();
    body.position.y = 0.5;
    root.add(body);

    // Torso / Jacket
    const torsoGeo = new THREE.CylinderGeometry(0.38, 0.44, 0.9, 16);
    const torso = new THREE.Mesh(torsoGeo, clothMaterial);
    torso.position.y = 0.45;
    body.add(torso);

    const trimGeo = new THREE.TorusGeometry(0.44, 0.025, 8, 24);
    const trim = new THREE.Mesh(trimGeo, clothTrimMaterial);
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.02;
    body.add(trim);

    // Collar / Chest
    const chestGeo = new THREE.SphereGeometry(0.36, 16, 12);
    chestGeo.scale(1.1, 0.7, 0.9);
    const chest = new THREE.Mesh(chestGeo, clothMaterial);
    chest.position.set(0, 0.82, 0.02);
    body.add(chest);

    // Neck
    const neckGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.3, 16);
    const neck = new THREE.Mesh(neckGeo, skinMaterial);
    neck.position.y = 1.05;
    body.add(neck);

    // Head Group (allows tilting, turning, nodding)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.25, 0);
    body.add(headGroup);

    // Head Mesh (refined stylized anime/3D proportion)
    const headGeo = new THREE.SphereGeometry(0.38, 24, 20);
    headGeo.scale(1.0, 1.12, 1.05);
    const head = new THREE.Mesh(headGeo, skinMaterial);
    headGroup.add(head);

    // Cheeks / Blush
    const cheekLeftGeo = new THREE.CircleGeometry(0.08, 16);
    const cheekLeft = new THREE.Mesh(cheekLeftGeo, blushMaterial);
    cheekLeft.position.set(-0.22, -0.05, 0.34);
    cheekLeft.rotation.y = -0.3;
    headGroup.add(cheekLeft);

    const cheekRight = new THREE.Mesh(cheekLeftGeo, blushMaterial);
    cheekRight.position.set(0.22, -0.05, 0.34);
    cheekRight.rotation.y = 0.3;
    headGroup.add(cheekRight);

    // Ears
    const earGeo = new THREE.SphereGeometry(0.08, 12, 8);
    earGeo.scale(0.5, 1.3, 0.8);
    const leftEar = new THREE.Mesh(earGeo, skinMaterial);
    leftEar.position.set(-0.4, 0, -0.02);
    leftEar.rotation.z = -0.15;
    headGroup.add(leftEar);

    const rightEar = new THREE.Mesh(earGeo, skinMaterial);
    rightEar.position.set(0.4, 0, -0.02);
    rightEar.rotation.z = 0.15;
    headGroup.add(rightEar);

    // Nose
    const noseGeo = new THREE.ConeGeometry(0.035, 0.08, 8);
    noseGeo.rotateX(Math.PI / 2);
    const nose = new THREE.Mesh(noseGeo, skinMaterial);
    nose.position.set(0, -0.02, 0.39);
    headGroup.add(nose);

    // Eyes
    const eyesGroup = new THREE.Group();
    eyesGroup.position.set(0, 0.08, 0.32);
    headGroup.add(eyesGroup);

    // Left Eye
    const eyeSocketGeo = new THREE.SphereGeometry(0.095, 16, 16);
    eyeSocketGeo.scale(1.1, 0.95, 0.6);
    const leftEye = new THREE.Mesh(eyeSocketGeo, eyeWhiteMaterial);
    leftEye.position.set(-0.16, 0, 0);
    eyesGroup.add(leftEye);

    const irisGeo = new THREE.SphereGeometry(0.058, 16, 12);
    irisGeo.scale(1, 1, 0.4);
    const leftIris = new THREE.Mesh(irisGeo, irisMaterial);
    leftIris.position.set(-0.16, 0, 0.045);
    eyesGroup.add(leftIris);

    const pupilGeo = new THREE.SphereGeometry(0.03, 12, 10);
    pupilGeo.scale(1, 1, 0.2);
    const leftPupil = new THREE.Mesh(pupilGeo, pupilMaterial);
    leftPupil.position.set(-0.16, 0, 0.065);
    eyesGroup.add(leftPupil);

    // Left Eyelid (for natural eye blink)
    const eyelidGeo = new THREE.SphereGeometry(0.102, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    eyelidGeo.scale(1.15, 1.0, 0.65);
    const leftEyelid = new THREE.Mesh(eyelidGeo, eyeLidMaterial);
    leftEyelid.position.set(-0.16, 0.02, 0.01);
    leftEyelid.rotation.x = -Math.PI / 2; // open default
    eyesGroup.add(leftEyelid);

    // Right Eye
    const rightEye = new THREE.Mesh(eyeSocketGeo, eyeWhiteMaterial);
    rightEye.position.set(0.16, 0, 0);
    eyesGroup.add(rightEye);

    const rightIris = new THREE.Mesh(irisGeo, irisMaterial);
    rightIris.position.set(0.16, 0, 0.045);
    eyesGroup.add(rightIris);

    const rightPupil = new THREE.Mesh(pupilGeo, pupilMaterial);
    rightPupil.position.set(0.16, 0, 0.065);
    eyesGroup.add(rightPupil);

    const rightEyelid = new THREE.Mesh(eyelidGeo, eyeLidMaterial);
    rightEyelid.position.set(0.16, 0.02, 0.01);
    rightEyelid.rotation.x = -Math.PI / 2; // open default
    eyesGroup.add(rightEyelid);

    // Eyebrows
    const browGeo = new THREE.BoxGeometry(0.12, 0.025, 0.03);
    const browMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.5 });
    const leftEyebrow = new THREE.Mesh(browGeo, browMat);
    leftEyebrow.position.set(-0.16, 0.12, 0.06);
    leftEyebrow.rotation.z = 0.05;
    eyesGroup.add(leftEyebrow);

    const rightEyebrow = new THREE.Mesh(browGeo, browMat);
    rightEyebrow.position.set(0.16, 0.12, 0.06);
    rightEyebrow.rotation.z = -0.05;
    eyesGroup.add(rightEyebrow);

    // Mouth Group (upper and lower lips, mouth cavity for visemes)
    const mouthGroup = new THREE.Group();
    mouthGroup.position.set(0, -0.16, 0.35);
    headGroup.add(mouthGroup);

    const cavityGeo = new THREE.SphereGeometry(0.07, 12, 10);
    cavityGeo.scale(1.2, 0.7, 0.5);
    const mouthCavity = new THREE.Mesh(cavityGeo, mouthInsideMaterial);
    mouthCavity.position.set(0, 0, -0.02);
    mouthCavity.scale.set(0.1, 0.1, 0.1);
    mouthGroup.add(mouthCavity);

    const lipGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.14, 12);
    lipGeo.rotateZ(Math.PI / 2);

    const upperLip = new THREE.Mesh(lipGeo, lipMaterial);
    upperLip.position.set(0, 0.015, 0.015);
    mouthGroup.add(upperLip);

    const lowerLip = new THREE.Mesh(lipGeo, lipMaterial);
    lowerLip.position.set(0, -0.015, 0.015);
    mouthGroup.add(lowerLip);

    // Hair Group (chic modern bob + twin bangs + ponytail / cyber streaks)
    const hairGroup = new THREE.Group();
    headGroup.add(hairGroup);

    // Hair Top/Crown
    const hairCrownGeo = new THREE.SphereGeometry(0.42, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.65);
    hairCrownGeo.scale(1.02, 1.05, 1.05);
    const hairCrown = new THREE.Mesh(hairCrownGeo, hairMaterial);
    hairCrown.position.set(0, 0.06, -0.02);
    hairGroup.add(hairCrown);

    // Hair Bangs (Fringe)
    const bangLeftGeo = new THREE.ConeGeometry(0.09, 0.28, 8);
    bangLeftGeo.rotateZ(0.25);
    const bangLeft = new THREE.Mesh(bangLeftGeo, hairMaterial);
    bangLeft.position.set(-0.16, 0.24, 0.32);
    hairGroup.add(bangLeft);

    const bangRightGeo = new THREE.ConeGeometry(0.09, 0.28, 8);
    bangRightGeo.rotateZ(-0.25);
    const bangRight = new THREE.Mesh(bangRightGeo, hairMaterial);
    bangRight.position.set(0.16, 0.24, 0.32);
    hairGroup.add(bangRight);

    // Cyber Highlight Hair Streak
    const streakGeo = new THREE.ConeGeometry(0.05, 0.32, 8);
    streakGeo.rotateZ(-0.35);
    const streak = new THREE.Mesh(streakGeo, cyberHighlightMaterial);
    streak.position.set(0.24, 0.18, 0.3);
    hairGroup.add(streak);

    // Side Locks
    const sideLockGeo = new THREE.CylinderGeometry(0.04, 0.01, 0.45, 8);
    const sideLockLeft = new THREE.Mesh(sideLockGeo, hairMaterial);
    sideLockLeft.position.set(-0.38, -0.05, 0.12);
    sideLockLeft.rotation.z = -0.1;
    hairGroup.add(sideLockLeft);

    const sideLockRight = new THREE.Mesh(sideLockGeo, hairMaterial);
    sideLockRight.position.set(0.38, -0.05, 0.12);
    sideLockRight.rotation.z = 0.1;
    hairGroup.add(sideLockRight);

    // Arms & Hands (Right & Left)
    const armGeo = new THREE.CylinderGeometry(0.075, 0.065, 0.45, 12);
    const forearmGeo = new THREE.CylinderGeometry(0.065, 0.055, 0.42, 12);
    const handGeo = new THREE.SphereGeometry(0.065, 12, 10);
    handGeo.scale(0.8, 1.2, 0.6);

    // Left Arm
    const leftShoulder = new THREE.Group();
    leftShoulder.position.set(-0.48, 0.8, 0);
    body.add(leftShoulder);

    const leftArm = new THREE.Mesh(armGeo, clothMaterial);
    leftArm.position.y = -0.22;
    leftShoulder.add(leftArm);

    const leftForearm = new THREE.Group();
    leftForearm.position.y = -0.44;
    leftShoulder.add(leftForearm);

    const leftForearmMesh = new THREE.Mesh(forearmGeo, skinMaterial);
    leftForearmMesh.position.y = -0.2;
    leftForearm.add(leftForearmMesh);

    const leftHand = new THREE.Mesh(handGeo, skinMaterial);
    leftHand.position.y = -0.42;
    leftForearm.add(leftHand);

    // Right Arm
    const rightShoulder = new THREE.Group();
    rightShoulder.position.set(0.48, 0.8, 0);
    body.add(rightShoulder);

    const rightArm = new THREE.Mesh(armGeo, clothMaterial);
    rightArm.position.y = -0.22;
    rightShoulder.add(rightArm);

    const rightForearm = new THREE.Group();
    rightForearm.position.y = -0.44;
    rightShoulder.add(rightForearm);

    const rightForearmMesh = new THREE.Mesh(forearmGeo, skinMaterial);
    rightForearmMesh.position.y = -0.2;
    rightForearm.add(rightForearmMesh);

    const rightHand = new THREE.Mesh(handGeo, skinMaterial);
    rightHand.position.y = -0.42;
    rightForearm.add(rightHand);

    // Default relaxed pose
    leftShoulder.rotation.z = 0.15;
    rightShoulder.rotation.z = -0.15;
    leftForearm.rotation.x = 0.2;
    rightForearm.rotation.x = 0.2;

    const bones: AvatarBones = {
      root,
      body,
      torso,
      chest,
      headGroup,
      head,
      hairGroup,
      eyesGroup,
      leftEye,
      rightEye,
      leftEyelid,
      rightEyelid,
      leftPupil,
      rightPupil,
      leftEyebrow,
      rightEyebrow,
      nose,
      mouthGroup,
      upperLip,
      lowerLip,
      mouthCavity,
      leftEar,
      rightEar,
      neck,
      leftShoulder,
      rightShoulder,
      leftArm,
      rightArm,
      leftForearm,
      rightForearm,
      leftHand,
      rightHand,
    };

    const materials = {
      skin: skinMaterial,
      hair: hairMaterial,
      cloth: clothMaterial,
      highlight: cyberHighlightMaterial,
      iris: irisMaterial,
      lip: lipMaterial,
    };

    return { root, bones, materials };
  }
}
