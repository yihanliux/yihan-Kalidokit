import * as Kalidokit from "../dist";
//Import Helper Functions from Kalidokit
const remap = Kalidokit.Utils.remap;
const clamp = Kalidokit.Utils.clamp;
const lerp = Kalidokit.Vector.lerp;

// --- 核心逻辑：等待整个HTML文档加载并准备就绪后，再执行所有代码 ---
document.addEventListener("DOMContentLoaded", () => {

    // --- 1. 获取所有需要操作的HTML元素 ---
    const rightPanel = document.querySelector("#right-panel");
    const toggleBtn = document.getElementById("toggle-video-btn");
    const previewContainer = document.querySelector(".preview");
    const videoUpload = document.getElementById("video-upload");
    const playbackVideo = document.getElementById("playback-video");
    const videoElement = document.querySelector(".input_video");
    const guideCanvas = document.querySelector("canvas.guides");

    // --- 2. 绑定所有UI元素的事件监听器 ---
    if(toggleBtn && previewContainer) {
        toggleBtn.addEventListener("click", () => {
            previewContainer.classList.toggle("hidden");
            toggleBtn.textContent = previewContainer.classList.contains("hidden") ? "显示摄像头" : "隐藏摄像头";
        });
    }
    if(videoUpload && playbackVideo) {
        videoUpload.addEventListener("change", (event) => {
            const file = event.target.files[0];
            if (file) {
                const fileURL = URL.createObjectURL(file);
                playbackVideo.src = fileURL;
                playbackVideo.load();
                playbackVideo.play();
            }
        });
    }

    // --- 3. THREE.JS 3D世界设置 ---
    let currentVrm;


    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({ alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    rightPanel.appendChild(renderer.domElement);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1.0, 1.0, 1.0).normalize();
    scene.add(light);

    const orbitCamera = new THREE.PerspectiveCamera(35, rightPanel.clientWidth / rightPanel.clientHeight, 0.1, 1000);
    orbitCamera.position.set(0.0, 1.4, 0.7);


    const orbitControls = new THREE.OrbitControls(orbitCamera, renderer.domElement);
    orbitControls.target.set(0.0, 1.4, 0.0);
    // ⭐ 添加初始更新
    orbitControls.update();
    // orbitControls.enabled = false;

    const clock = new THREE.Clock();
    function animate() {
        requestAnimationFrame(animate);
        if (currentVrm) currentVrm.update(clock.getDelta());
        renderer.render(scene, orbitCamera);
    }
    animate();

    function onWindowResize() {
        if (!rightPanel) return;
        orbitCamera.aspect = rightPanel.clientWidth / rightPanel.clientHeight;
        orbitCamera.updateProjectionMatrix();
        renderer.setSize(rightPanel.clientWidth, rightPanel.clientHeight);
    }
    window.addEventListener("resize", onWindowResize);
    onWindowResize();

    // --- 4. VRM 角色设置与动画逻辑 ---
    const loader = new THREE.GLTFLoader();
    loader.crossOrigin = "anonymous";
    loader.load(
        // "/models/model1.vrm",
        "https://cdn.glitch.com/29e07830-2317-4b15-a044-135e73c7f840%2FAshtra.vrm?v=1630342336981",
        (gltf) => {
        THREE.VRMUtils.removeUnnecessaryJoints(gltf.scene);
        THREE.VRM.from(gltf).then((vrm) => {
            scene.add(vrm.scene);
            currentVrm = vrm;
            currentVrm.scene.rotation.y = Math.PI;
        });
    });

    // 动画旋转的辅助函数
    const rigRotation = (name, rotation = { x: 0, y: 0, z: 0 }, dampener = 1, lerpAmount = 0.3) => {
        if (!currentVrm) return;
        const Part = currentVrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName[name]);
        if (!Part) return;

        // ⭐ 使用 Kalidokit 可能提供的 rotationOrder
        let euler = new THREE.Euler(
            rotation.x * dampener,
            rotation.y * dampener,
            rotation.z * dampener,
            rotation.rotationOrder || "XYZ" // <--- 应用此更改
        );
        let quaternion = new THREE.Quaternion().setFromEuler(euler);
        Part.quaternion.slerp(quaternion, lerpAmount);
    };

    // 动画位置的辅助函数
    const rigPosition = (name, position = { x: 0, y: 0, z: 0 }, dampener = 1, lerpAmount = 0.3) => {
        if (!currentVrm) return;
        const Part = currentVrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName[name]);
        if (!Part) return;
        let vector = new THREE.Vector3(position.x * dampener, position.y * dampener, position.z * dampener);
        Part.position.lerp(vector, lerpAmount);
    };

    // 驱动面部动画的函数
    let oldLookTarget = new THREE.Euler();
    const rigFace = (riggedFace) => {
        if (!currentVrm || !riggedFace) return;
        rigRotation("Neck", riggedFace.head, 0.7);
        const Blendshape = currentVrm.blendShapeProxy;
        const PresetName = THREE.VRMSchema.BlendShapePresetName;
        riggedFace.eye.l = lerp(clamp(1 - riggedFace.eye.l, 0, 1), Blendshape.getValue(PresetName.Blink), 0.5);
        riggedFace.eye.r = lerp(clamp(1 - riggedFace.eye.r, 0, 1), Blendshape.getValue(PresetName.Blink), 0.5);
        riggedFace.eye = Kalidokit.Face.stabilizeBlink(riggedFace.eye, riggedFace.head.y);
        Blendshape.setValue(PresetName.Blink, riggedFace.eye.l);
        Blendshape.setValue(PresetName.I, lerp(riggedFace.mouth.shape.I, Blendshape.getValue(PresetName.I), 0.5));
        Blendshape.setValue(PresetName.A, lerp(riggedFace.mouth.shape.A, Blendshape.getValue(PresetName.A), 0.5));
        Blendshape.setValue(PresetName.E, lerp(riggedFace.mouth.shape.E, Blendshape.getValue(PresetName.E), 0.5));
        Blendshape.setValue(PresetName.O, lerp(riggedFace.mouth.shape.O, Blendshape.getValue(PresetName.O), 0.5));
        Blendshape.setValue(PresetName.U, lerp(riggedFace.mouth.shape.U, Blendshape.getValue(PresetName.U), 0.5));
        let lookTarget = new THREE.Euler(lerp(oldLookTarget.x, riggedFace.pupil.y, 0.4), lerp(oldLookTarget.y, riggedFace.pupil.x, 0.4), 0, "XYZ");
        oldLookTarget.copy(lookTarget);
        currentVrm.lookAt.applyer.lookAt(lookTarget);
    };

    // VRM 角色动画器 (已优化)
    const animateVRM = (vrm, results) => {
        if (!vrm) {
            return;
        }
        // Take the results from `Holistic` and animate character based on its Face, Pose, and Hand Keypoints.
        let riggedPose, riggedLeftHand, riggedRightHand, riggedFace;

        const faceLandmarks = results.faceLandmarks;
        // Pose 3D Landmarks are with respect to Hip distance in meters
        const pose3DLandmarks = results.ea;
        // Pose 2D landmarks are with respect to videoWidth and videoHeight
        const pose2DLandmarks = results.poseLandmarks;
        // Be careful, hand landmarks may be reversed
        const leftHandLandmarks = results.rightHandLandmarks;
        const rightHandLandmarks = results.leftHandLandmarks;

        // Animate Face
        if (faceLandmarks) {
            riggedFace = Kalidokit.Face.solve(faceLandmarks, {
                runtime: "mediapipe",
                video: videoElement,
            });
            rigFace(riggedFace);
        }

        // Animate Pose
        if (pose2DLandmarks && pose3DLandmarks) {
            riggedPose = Kalidokit.Pose.solve(pose3DLandmarks, pose2DLandmarks, {
                runtime: "mediapipe",
                video: videoElement,
            });
            rigRotation("Hips", riggedPose.Hips.rotation, 0.7);
            rigPosition(
                "Hips",
                {
                    x: riggedPose.Hips.position.x, // Reverse direction
                    y: riggedPose.Hips.position.y + 1.4, // Add a bit of height
                    z: -riggedPose.Hips.position.z, // Reverse direction
                },
                1,
                0.07
            );

            rigRotation("Chest", riggedPose.Spine, 0.25, 0.3);
            rigRotation("Spine", riggedPose.Spine, 0.45, 0.3);

            rigRotation("RightUpperArm", riggedPose.RightUpperArm, 1, 0.3);
            rigRotation("RightLowerArm", riggedPose.RightLowerArm, 1, 0.3);
            rigRotation("LeftUpperArm", riggedPose.LeftUpperArm, 1, 0.3);
            rigRotation("LeftLowerArm", riggedPose.LeftLowerArm, 1, 0.3);

            rigRotation("LeftUpperLeg", riggedPose.LeftUpperLeg, 1, 0.3);
            rigRotation("LeftLowerLeg", riggedPose.LeftLowerLeg, 1, 0.3);
            rigRotation("RightUpperLeg", riggedPose.RightUpperLeg, 1, 0.3);
            rigRotation("RightLowerLeg", riggedPose.RightLowerLeg, 1, 0.3);
        }

        // Animate Hands
        if (leftHandLandmarks) {
            riggedLeftHand = Kalidokit.Hand.solve(leftHandLandmarks, "Left");
            rigRotation("LeftHand", {
                // Combine pose rotation Z and hand rotation X Y
                z: riggedPose.LeftHand.z,
                y: riggedLeftHand.LeftWrist.y,
                x: riggedLeftHand.LeftWrist.x,
            });
            rigRotation("LeftRingProximal", riggedLeftHand.LeftRingProximal);
            rigRotation("LeftRingIntermediate", riggedLeftHand.LeftRingIntermediate);
            rigRotation("LeftRingDistal", riggedLeftHand.LeftRingDistal);
            rigRotation("LeftIndexProximal", riggedLeftHand.LeftIndexProximal);
            rigRotation("LeftIndexIntermediate", riggedLeftHand.LeftIndexIntermediate);
            rigRotation("LeftIndexDistal", riggedLeftHand.LeftIndexDistal);
            rigRotation("LeftMiddleProximal", riggedLeftHand.LeftMiddleProximal);
            rigRotation("LeftMiddleIntermediate", riggedLeftHand.LeftMiddleIntermediate);
            rigRotation("LeftMiddleDistal", riggedLeftHand.LeftMiddleDistal);
            rigRotation("LeftThumbProximal", riggedLeftHand.LeftThumbProximal);
            rigRotation("LeftThumbIntermediate", riggedLeftHand.LeftThumbIntermediate);
            rigRotation("LeftThumbDistal", riggedLeftHand.LeftThumbDistal);
            rigRotation("LeftLittleProximal", riggedLeftHand.LeftLittleProximal);
            rigRotation("LeftLittleIntermediate", riggedLeftHand.LeftLittleIntermediate);
            rigRotation("LeftLittleDistal", riggedLeftHand.LeftLittleDistal);
        }
        if (rightHandLandmarks) {
            riggedRightHand = Kalidokit.Hand.solve(rightHandLandmarks, "Right");
            rigRotation("RightHand", {
                // Combine Z axis from pose hand and X/Y axis from hand wrist rotation
                z: riggedPose.RightHand.z,
                y: riggedRightHand.RightWrist.y,
                x: riggedRightHand.RightWrist.x,
            });
            rigRotation("RightRingProximal", riggedRightHand.RightRingProximal);
            rigRotation("RightRingIntermediate", riggedRightHand.RightRingIntermediate);
            rigRotation("RightRingDistal", riggedRightHand.RightRingDistal);
            rigRotation("RightIndexProximal", riggedRightHand.RightIndexProximal);
            rigRotation("RightIndexIntermediate", riggedRightHand.RightIndexIntermediate);
            rigRotation("RightIndexDistal", riggedRightHand.RightIndexDistal);
            rigRotation("RightMiddleProximal", riggedRightHand.RightMiddleProximal);
            rigRotation("RightMiddleIntermediate", riggedRightHand.RightMiddleIntermediate);
            rigRotation("RightMiddleDistal", riggedRightHand.RightMiddleDistal);
            rigRotation("RightThumbProximal", riggedRightHand.RightThumbProximal);
            rigRotation("RightThumbIntermediate", riggedRightHand.RightThumbIntermediate);
            rigRotation("RightThumbDistal", riggedRightHand.RightThumbDistal);
            rigRotation("RightLittleProximal", riggedRightHand.RightLittleProximal);
            rigRotation("RightLittleIntermediate", riggedRightHand.RightLittleIntermediate);
            rigRotation("RightLittleDistal", riggedRightHand.RightLittleDistal);
        }
    };

    // --- 5. MEDIAPIPE 设置与摄像头启动 ---
    const holistic = new Holistic({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1635989137/${file}`
    });
    holistic.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7,
        refineFaceLandmarks: true,
    });
    holistic.onResults((results) => {
        drawResults(results);
        animateVRM(currentVrm, results);
    });

    // 绘制辅助线的函数 (完整修正版)
    const drawResults = (results) => {
        guideCanvas.width = videoElement.videoWidth;
        guideCanvas.height = videoElement.videoHeight;
        let canvasCtx = guideCanvas.getContext("2d");
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, guideCanvas.width, guideCanvas.height);
        // Use `Mediapipe` drawing functions
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {
            color: "#00cff7",
            lineWidth: 4,
        });
        drawLandmarks(canvasCtx, results.poseLandmarks, {
            color: "#ff0364",
            lineWidth: 2,
        });
        drawConnectors(canvasCtx, results.faceLandmarks, FACEMESH_TESSELATION, {
            color: "#C0C0C070",
            lineWidth: 1,
        });
        if (results.faceLandmarks && results.faceLandmarks.length === 478) {
            //draw pupils
            drawLandmarks(canvasCtx, [results.faceLandmarks[468], results.faceLandmarks[468 + 5]], {
                color: "#ffe603",
                lineWidth: 2,
            });
        }
        drawConnectors(canvasCtx, results.leftHandLandmarks, HAND_CONNECTIONS, {
            color: "#eb1064",
            lineWidth: 5,
        });
        drawLandmarks(canvasCtx, results.leftHandLandmarks, {
            color: "#00cff7",
            lineWidth: 2,
        });
        drawConnectors(canvasCtx, results.rightHandLandmarks, HAND_CONNECTIONS, {
            color: "#22c3e3",
            lineWidth: 5,
        });
        drawLandmarks(canvasCtx, results.rightHandLandmarks, {
            color: "#ff0364",
            lineWidth: 2,
        });
    };

    // Use `Mediapipe` utils to get camera - lower resolution = higher fps
    const camera = new Camera(videoElement, {
        onFrame: async () => {
            await holistic.send({ image: videoElement });
        },
        width: 640,
        height: 480,
    });
    camera.start();

}); // --- 所有代码都在这个 DOMContentLoaded 监听器之内结束 ---