// sphere.js - 3D rotierende, leuchtende Kugel mit Mausinteraktion

let scene, camera, renderer, sphere, isMouseDown = false, mouseX = 0, mouseY = 0;

function initSphere() {
    const container = document.getElementById('sphere-container');
    if (!container) return;

    // Szene erstellen
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // Kamera erstellen
    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.z = 5;

    // Renderer erstellen
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // Kugel-Geometrie
    const geometry = new THREE.SphereGeometry(1, 32, 32);

    // Leuchtendes Material
    const material = new THREE.MeshPhongMaterial({
        color: 0x8b5cf6, // Lila Farbe
        emissive: 0x4c1d95, // Leuchteffekt
        emissiveIntensity: 0.3,
        shininess: 100
    });

    // Kugel erstellen
    sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    // Lichter hinzufügen
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Punktlicht für zusätzlichen Leuchteffekt
    const pointLight = new THREE.PointLight(0x8b5cf6, 0.5, 100);
    pointLight.position.set(2, 2, 2);
    scene.add(pointLight);

    // Event-Listener für Mausinteraktion
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('mouseleave', onMouseUp);

    // Touch-Events für mobile Geräte
    renderer.domElement.addEventListener('touchstart', onTouchStart);
    renderer.domElement.addEventListener('touchmove', onTouchMove);
    renderer.domElement.addEventListener('touchend', onTouchEnd);

    // Animation starten
    animate();

    // Fenstergröße anpassen
    window.addEventListener('resize', onWindowResize);
}

function onMouseDown(event) {
    isMouseDown = true;
    mouseX = event.clientX;
    mouseY = event.clientY;
}

function onMouseMove(event) {
    if (!isMouseDown) return;

    const deltaX = event.clientX - mouseX;
    const deltaY = event.clientY - mouseY;

    sphere.rotation.y += deltaX * 0.01;
    sphere.rotation.x += deltaY * 0.01;

    mouseX = event.clientX;
    mouseY = event.clientY;
}

function onMouseUp() {
    isMouseDown = false;
}

function onTouchStart(event) {
    if (event.touches.length === 1) {
        isMouseDown = true;
        mouseX = event.touches[0].clientX;
        mouseY = event.touches[0].clientY;
    }
}

function onTouchMove(event) {
    if (!isMouseDown || event.touches.length !== 1) return;
    event.preventDefault();

    const deltaX = event.touches[0].clientX - mouseX;
    const deltaY = event.touches[0].clientY - mouseY;

    sphere.rotation.y += deltaX * 0.01;
    sphere.rotation.x += deltaY * 0.01;

    mouseX = event.touches[0].clientX;
    mouseY = event.touches[0].clientY;
}

function onTouchEnd() {
    isMouseDown = false;
}

function onWindowResize() {
    const container = document.getElementById('sphere-container');
    if (!container) return;

    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
    requestAnimationFrame(animate);

    // Kontinuierliche langsame Rotation
    if (!isMouseDown) {
        sphere.rotation.y += 0.005;
        sphere.rotation.x += 0.002;
    }

    renderer.render(scene, camera);
}

// Initialisierung starten, wenn DOM bereit ist
document.addEventListener('DOMContentLoaded', initSphere);