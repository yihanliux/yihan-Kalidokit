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

    // renderer
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

    // VRM 角色动画器 (已优化)
    const animateVRM = (vrm, results) => {
        if (!vrm) {
            return;
        }
        const pose3DLandmarks = results.poseWorldLandmarks; // 从 results.ea 改为 results.poseWorldLandmarks
        const pose2DLandmarks = results.poseLandmarks;

        // Animate Pose
    if (pose2DLandmarks && pose3DLandmarks) {
        const riggedPose = Kalidokit.Pose.solve(pose3DLandmarks, pose2DLandmarks, {
            runtime: "mediapipe",
        });

        // --- 这部分身体姿态的代码完全保留 ---
        rigRotation("Hips", riggedPose.Hips.rotation, 0.7);
        rigPosition(
            "Hips",
            {
                x: riggedPose.Hips.position.x,
                y: riggedPose.Hips.position.y + 1,
                z: -riggedPose.Hips.position.z,
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

        // 手部的旋转现在直接由姿态估算得出，不再需要手部模型
        rigRotation("LeftHand", riggedPose.LeftHand);
        rigRotation("RightHand", riggedPose.RightHand);
    }
};

    const onResults = (results) => {
        drawResults(results);
        animateVRM(currentVrm, results);
    };

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
    };

    // --- 5. MEDIAPIPE 设置与摄像头启动 ---
   const pose = new Pose({
        locateFile: (file) => {
            // 注意路径的变化
            return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
        },
    });

    // 设置 Pose 模型的参数
    pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5, // 可以适当调低，因为只处理姿势
        minTrackingConfidence: 0.5,
    });

    pose.onResults(onResults);

    // Use `Mediapipe` utils to get camera - lower resolution = higher fps
    const camera = new Camera(videoElement, {
        onFrame: async () => {
            await pose.send({ image: videoElement });
        },
        width: 640,
        height: 480,
    });
    camera.start();

}); // --- 所有代码都在这个 DOMContentLoaded 监听器之内结束 ---