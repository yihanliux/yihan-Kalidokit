

// 引入 Kalidokit 库，这是一个用于实时姿态追踪的解算器
import * as Kalidokit from "../dist";

// 从 Kalidokit 中提取常用的辅助函数，以简化代码
const remap = Kalidokit.Utils.remap;
const clamp = Kalidokit.Utils.clamp;
const lerp = Kalidokit.Vector.lerp;

// --- 核心逻辑：等待整个HTML文档加载并准备就绪后，再执行所有代码 ---
// 这是一个好的实践，可以防止因脚本在DOM元素渲染完成前执行而导致的错误。
document.addEventListener("DOMContentLoaded", () => {

    // --- 1. 获取所有需要操作的HTML元素 ---
    // 在脚本开始时一次性获取所有DOM元素的引用，可以提高性能并使代码更整洁。
    const rightPanel = document.querySelector("#right-panel");
    const toggleBtn = document.getElementById("toggle-video-btn");
    const previewContainer = document.querySelector(".preview");
    const videoUpload = document.getElementById("video-upload");
    const playbackVideo = document.getElementById("playback-video");
    const videoElement = document.querySelector(".input_video");
    const guideCanvas = document.querySelector("canvas.guides");

    // --- 2. 绑定所有UI元素的事件监听器 ---

    // 绑定“隐藏/显示摄像头”按钮的点击事件
    if(toggleBtn && previewContainer) {
        toggleBtn.addEventListener("click", () => {
            previewContainer.classList.toggle("hidden"); // 切换CSS类来控制显示和隐藏
            toggleBtn.textContent = previewContainer.classList.contains("hidden") ? "显示摄像头" : "隐藏摄像头";
        });
    }

    // 绑定视频上传控件的change事件，用于播放用户选择的本地视频文件
    if(videoUpload && playbackVideo) {
        videoUpload.addEventListener("change", (event) => {
            const file = event.target.files[0];
            if (file) {
                // 使用 URL.createObjectURL 创建一个临时的URL指向本地文件
                const fileURL = URL.createObjectURL(file);
                playbackVideo.src = fileURL;
                playbackVideo.load();
                playbackVideo.play();
            }
        });
    }

    // --- 3. THREE.JS 3D世界设置 ---

    let currentVrm; // 用于存储当前加载的VRM模型

    // 场景：所有3D物件的容器
    const scene = new THREE.Scene();

    // 渲染器：将场景内容绘制到屏幕上
    const renderer = new THREE.WebGLRenderer({ alpha: true }); // alpha:true 使背景透明
    renderer.setPixelRatio(window.devicePixelRatio); // 设置像素比以适应高DPI屏幕
    rightPanel.appendChild(renderer.domElement); // 将渲染器的canvas元素添加到右侧面板

    // 灯光：照亮场景中的物体
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1.0, 1.0, 1.0).normalize();
    scene.add(light);

    // 摄像机：我们观察3D世界的视点
    const orbitCamera = new THREE.PerspectiveCamera(35, rightPanel.clientWidth / rightPanel.clientHeight, 0.1, 1000);
    orbitCamera.position.set(0.0, 1.4, 0.7);

    // 轨道控制器：允许用户使用鼠标缩放、平移和旋转摄像机
    const orbitControls = new THREE.OrbitControls(orbitCamera, renderer.domElement);
    orbitControls.target.set(0.0, 1.4, 0.0);
    orbitControls.update(); // 初始化控制器状态

    // 时钟：用于跟踪自上次渲染以来的时间差，对物理和动画很重要
    const clock = new THREE.Clock();

    /**
     * 主动画循环函数。
     * @description 这个函数在每一帧都被调用，负责更新模型状态和重新渲染场景。
     */
    function animate() {
        requestAnimationFrame(animate); // 请求浏览器在下一次重绘前调用animate

        if (currentVrm) {
            // 更新VRM模型的内置动画和物理（如头发、裙子）
            currentVrm.update(clock.getDelta());
        }
        renderer.render(scene, orbitCamera); // 渲染场景
    }
    animate(); // 启动动画循环

    /**
     * 窗口大小调整事件的处理函数。
     * @description 当浏览器窗口大小改变时，调整渲染器和摄像机的尺寸以适应新窗口。
     */
    function onWindowResize() {
        if (!rightPanel) return;
        orbitCamera.aspect = rightPanel.clientWidth / rightPanel.clientHeight;
        orbitCamera.updateProjectionMatrix(); // 更新摄像机的投影矩阵
        renderer.setSize(rightPanel.clientWidth, rightPanel.clientHeight);
    }
    window.addEventListener("resize", onWindowResize); // 监听窗口大小变化
    onWindowResize(); // 初始化一次尺寸

    // --- 4. VRM 角色设置与动画逻辑 ---

    // GLTF加载器，用于加载VRM模型（VRM基于gLTF格式）
    const loader = new THREE.GLTFLoader();
    loader.crossOrigin = "anonymous"; // 允许跨域加载模型

    // 异步加载VRM模型
    loader.load(
        // "https://cdn.glitch.com/29e07830-2317-4b15-a044-135e73c7f840%2FAshtra.vrm?v=1630342336981",
        "/models/model1.vrm",
        (gltf) => {
            // 移除不必要的骨骼，这是一个针对VRM的优化
            THREE.VRMUtils.removeUnnecessaryJoints(gltf.scene);

            // 从加载的gltf数据创建VRM实例
            THREE.VRM.from(gltf).then((vrm) => {
                scene.add(vrm.scene); // 将模型添加到场景
                currentVrm = vrm;
                currentVrm.scene.rotation.y = Math.PI; // 将模型旋转180度，使其面向摄像机
            });
        }
    );

    /**
     * 辅助函数：平滑地旋转VRM模型的指定骨骼。
     * @param {string} name - VRM骨骼的名称 (例如, "Hips", "LeftUpperArm").
     * @param {object} rotation - 包含x, y, z旋转值的对象。
     * @param {number} dampener - 旋转强度的衰减系数，用于减弱动作幅度。
     * @param {number} lerpAmount - 线性插值的量，控制动作的平滑度（值越小越平滑）。
     */
    const rigRotation = (name, rotation = { x: 0, y: 0, z: 0 }, dampener = 1, lerpAmount = 0.3) => {
        if (!currentVrm) return;
        const Part = currentVrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName[name]);
        if (!Part) return;

        let euler = new THREE.Euler(
            rotation.x * dampener,
            rotation.y * dampener,
            rotation.z * dampener,
            rotation.rotationOrder || "XYZ"
        );
        let quaternion = new THREE.Quaternion().setFromEuler(euler);
        // 使用球面线性插值(slerp)来平滑地过渡到新的旋转状态，避免动画抖动
        Part.quaternion.slerp(quaternion, lerpAmount);
    };

    /**
     * 辅助函数：平滑地移动VRM模型的指定骨骼的位置。
     * @param {string} name - VRM骨骼的名称。
     * @param {object} position - 包含x, y, z位置值的对象。
     * @param {number} dampener - 位移强度的衰减系数。
     * @param {number} lerpAmount - 线性插值的量，控制动作的平滑度。
     */
    const rigPosition = (name, position = { x: 0, y: 0, z: 0 }, dampener = 1, lerpAmount = 0.3) => {
        if (!currentVrm) return;
        const Part = currentVrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName[name]);
        if (!Part) return;
        let vector = new THREE.Vector3(position.x * dampener, position.y * dampener, position.z * dampener);
        // 使用线性插值(lerp)来平滑地过渡到新的位置
        Part.position.lerp(vector, lerpAmount);
    };

    /**
     * 主动画器函数，将MediaPipe的姿态结果应用到VRM模型上。
     * @param {object} vrm - 当前的VRM模型实例。
     * @param {object} results - MediaPipe Pose返回的识别结果。
     */
    const animateVRM = (vrm, results) => {
        if (!vrm || !results.poseWorldLandmarks) return;

        // 从识别结果中获取3D和2D的姿态标定点
        const pose3DLandmarks = results.poseWorldLandmarks;
        const pose2DLandmarks = results.poseLandmarks;

        // 使用Kalidokit的Pose解算器，将标定点转换为可用的旋转和位置数据
        const riggedPose = Kalidokit.Pose.solve(pose3DLandmarks, pose2DLandmarks, {
            runtime: "mediapipe",
        });

        if (!riggedPose) return;

        // 将计算出的旋转和位置数据应用到VRM模型的各个身体部位
        rigRotation("Hips", riggedPose.Hips.rotation, 0.7);
        rigPosition(
            "Hips",
            {
                x: riggedPose.Hips.position.x,
                y: riggedPose.Hips.position.y + 1.4, // 稍微抬高模型位置
                z: -riggedPose.Hips.position.z, // 反转Z轴以匹配Three.js坐标系
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
        rigRotation("LeftHand", riggedPose.LeftHand);
        rigRotation("RightHand", riggedPose.RightHand);
    };

    /**
     * 在Canvas上绘制MediaPipe识别出的姿态辅助线，用于调试。
     * @param {object} results - MediaPipe Pose返回的识别结果。
     */
    const drawResults = (results) => {
        guideCanvas.width = videoElement.videoWidth;
        guideCanvas.height = videoElement.videoHeight;
        let canvasCtx = guideCanvas.getContext("2d");
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, guideCanvas.width, guideCanvas.height);

        // 使用MediaPipe的绘图工具来绘制连接线和标定点
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {
            color: "#00cff7",
            lineWidth: 4,
        });
        drawLandmarks(canvasCtx, results.poseLandmarks, {
            color: "#ff0364",
            lineWidth: 2,
        });
        canvasCtx.restore();
    };

    /**
     * MediaPipe的回调函数，每当有新的识别结果时被调用。
     * @param {object} results - MediaPipe Pose返回的识别结果。
     */
    const onResults = (results) => {
        // 将结果传递给绘图函数和VRM动画函数
        drawResults(results);
        animateVRM(currentVrm, results);
    };

    // --- 5. MEDIAPIPE 设置与摄像头启动 ---

    // 初始化MediaPipe Pose实例
    const pose = new Pose({
        locateFile: (file) => {
            // 指定模型文件的CDN路径
            return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
        },
    });

    // 设置Pose模型的参数
    pose.setOptions({
        modelComplexity: 2, // 模型复杂度，1表示中等模型
        smoothLandmarks: true, // 平滑标定点以减少抖动
        minDetectionConfidence: 0.5, // 最低检测置信度
        minTrackingConfidence: 0.5, // 最低跟踪置信度
    });

    // 绑定回调函数，将onResults函数传递给MediaPipe实例
    pose.onResults(onResults);

    // 使用MediaPipe的Camera辅助工具来处理摄像头视频流
    const camera = new Camera(videoElement, {
        onFrame: async () => {
            // 在每一帧上，将摄像头图像发送给Pose模型进行处理
            await pose.send({ image: videoElement });
        },
        width: 640,
        height: 480, // 使用较低分辨率以提高帧率
    });
    camera.start(); // 启动摄像头

}); // --- DOMContentLoaded 监听器结束 ---