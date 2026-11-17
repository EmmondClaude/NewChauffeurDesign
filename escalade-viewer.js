/* The Chauffeurs: explicit opt-in, self-hosted 3D. No model or renderer before activation. */
(() => {
  'use strict';
  const root = document.getElementById('escalade-viewer');
  if (!root) return;
  const launch = root.querySelector('[data-launch]'), status = root.querySelector('[data-status]');
  const poster = root.querySelector('img'), canvas = root.querySelector('canvas'), angles = root.querySelector('[data-angles]');
  const controls = root.querySelector('[data-controls]'), toggle = root.querySelector('[data-toggle]');
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : {matches:false};
  let renderer, scene, camera, model, observer, resizeObserver, frame, timer;
  let loading = false, ready = false, visible = true, rotating = !motion.matches, generation = 0, modelRadius = 1;
  const scriptPromises = {};
  const angleURL = '/media/escalade-turntable-6d86f5f27a03.webp';
  let angleMode = false, angleIndex = 0;
  function renderAngle() {
    angles.style.backgroundPosition = `${angleIndex % 4 / 3 * 100}% ${Math.floor(angleIndex / 4) / 2 * 100}%`;
    angles.setAttribute('aria-label', `Black Cadillac SUV, view ${angleIndex + 1} of 12`);
  }
  async function showAngles(token) {
    if (!angles || token !== generation) return;
    const sprite = new Image();
    let expiry;
    try {
      await Promise.race([
        new Promise((resolve, reject) => { sprite.onload = resolve; sprite.onerror = reject; sprite.src = angleURL; }),
        new Promise((_, reject) => { expiry = setTimeout(reject, 6000); })
      ]);
    } catch (_) { return; }
    finally { clearTimeout(expiry); }
    if (token !== generation) return;
    angleMode = true; angleIndex = 0;
    angles.style.backgroundImage = `url("${angleURL}")`; renderAngle();
    poster.hidden = true; angles.hidden = false; canvas.hidden = true;
    toggle.hidden = true; controls.hidden = false; launch.hidden = true;
    status.textContent = '12-angle view. Use the left and right buttons to see the vehicle from different sides.';
    root.querySelector('[data-turn]').focus();
  }
  function script(src) {
    if (scriptPromises[src]) return scriptPromises[src];
    scriptPromises[src] = new Promise((resolve, reject) => {
      const el = document.createElement('script'); el.src = src;
      el.onload = resolve; el.onerror = () => { delete scriptPromises[src]; el.remove(); reject(new Error('script')); };
      document.head.appendChild(el);
    });
    return scriptPromises[src];
  }
  function stop() { clearTimeout(timer); cancelAnimationFrame(frame); }
  function draw() { if (ready && renderer && !document.hidden && visible) { try { renderer.render(scene, camera); } catch (_) { fallback('The interactive view was interrupted. The vehicle image remains available.'); } } }
  function loop() {
    stop();
    if (!ready || !rotating || !visible || document.hidden) return;
    timer = setTimeout(() => { frame = requestAnimationFrame(() => { if (model) model.rotation.y += 0.006; draw(); loop(); }); }, 33);
  }
  function resize() {
    if (!renderer) return;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false); camera.aspect = width / height;
    const verticalFov = camera.fov * Math.PI / 180;
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
    const distance = modelRadius / Math.sin(Math.min(verticalFov, horizontalFov) / 2) * 1.15;
    camera.position.set(-2.8, 1.2, -2.0).normalize().multiplyScalar(distance); camera.lookAt(0, 0, 0);
    camera.near = Math.max(.01, distance - modelRadius * 2); camera.far = distance + modelRadius * 3;
    camera.updateProjectionMatrix(); draw();
  }
  function buttonState() { toggle.textContent = rotating ? 'Pause rotation' : 'Play rotation'; toggle.setAttribute('aria-pressed', String(rotating)); }
  function fallback(message, offerAngles = false) {
    ++generation; loading = false; ready = false; angleMode = false; stop();
    if (angles) angles.hidden = true; toggle.hidden = false;
    root.removeAttribute('aria-busy'); poster.hidden = false; canvas.hidden = true; controls.hidden = true;
    launch.hidden = false; launch.disabled = false; launch.textContent = 'Try interactive view'; status.textContent = message;
    if (model) { model.traverse(object => { if (object.geometry) object.geometry.dispose(); const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []; materials.forEach(material => { Object.values(material).forEach(value => { if (value && value.isTexture) value.dispose(); }); material.dispose(); }); }); model = null; }
    if (renderer) { renderer.dispose(); renderer = null; }
    if (offerAngles) void showAngles(generation);
  }
  async function activate() {
    if (loading || ready) return;
    loading = true; const token = ++generation;
    launch.disabled = true; root.setAttribute('aria-busy', 'true'); status.textContent = 'Loading interactive vehicle…';
    const timeout = setTimeout(() => { if (token === generation) fallback('The interactive view could not load. The vehicle image remains available.'); }, 30000);
    try {
      await script('/vendor/three-r128.min.js'); await script('/vendor/GLTFLoader-r128.js');
      if (token !== generation) return;
      const THREE = window.THREE;
      renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true, powerPreference: 'low-power'});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
      scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
      camera.position.set(-2.8, 1.2, -2.0); camera.lookAt(0, 0, 0);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x545454, 1.4));
      const key = new THREE.DirectionalLight(0xffffff, 2); key.position.set(-3, 4, -2); scene.add(key);
      const fill = new THREE.DirectionalLight(0xe8d6ab, .7); fill.position.set(3, 2, 3); scene.add(fill);
      const gltf = await new Promise((resolve,reject) => new THREE.GLTFLoader().load('/media/escalade-6d10f368d558.glb',resolve,undefined,reject));
      if (token !== generation) return;
      const content = gltf.scene;
      const box = new THREE.Box3().setFromObject(content), center = box.getCenter(new THREE.Vector3());
      modelRadius = box.getBoundingSphere(new THREE.Sphere()).radius;
      content.position.sub(center);
      model = new THREE.Group(); model.add(content); scene.add(model);
      loading = false; ready = true; poster.hidden = true; canvas.hidden = false; controls.hidden = false;
      launch.hidden = true; root.removeAttribute('aria-busy');
      rotating = !motion.matches; buttonState(); resize(); if (!ready) return; loop();
      status.textContent = 'Interactive vehicle loaded. Use the rotation buttons to explore.'; toggle.focus();
      if (!resizeObserver && 'ResizeObserver' in window) { resizeObserver = new ResizeObserver(resize); resizeObserver.observe(root); }
    } catch (_) { if (token === generation) fallback('Live 3D could not load. The vehicle image remains available.', true); }
    finally { clearTimeout(timeout); }
  }
  launch.hidden = false;
  launch.addEventListener('click', activate);
  toggle.addEventListener('click', () => { rotating = !rotating; buttonState(); loop(); draw(); });
  root.querySelectorAll('[data-turn]').forEach(button => button.addEventListener('click', () => { if (angleMode) {
    angleIndex = (angleIndex + (Number(button.dataset.turn) > 0 ? 1 : 11)) % 12;
    renderAngle();
    status.textContent = `Vehicle view ${angleIndex + 1} of 12.`;
    return;
  } if (!model) return; rotating = false; buttonState(); stop(); model.rotation.y += Number(button.dataset.turn); draw(); }));
  root.querySelector('[data-static]').addEventListener('click', () => { fallback('Vehicle image displayed.'); launch.textContent = 'Explore in 3D'; launch.focus(); });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); fallback('The 3D view was interrupted. The vehicle image is still available.', true); });
  document.addEventListener('visibilitychange', () => { loop(); draw(); });
  window.addEventListener('resize', resize, {passive:true});
  if ('IntersectionObserver' in window) { observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; loop(); draw(); }, {threshold: .05}); observer.observe(root); }
  const change = () => { if (motion.matches) { rotating = false; buttonState(); stop(); draw(); } };
  if (motion.addEventListener) motion.addEventListener('change', change); else if (motion.addListener) motion.addListener(change);
  window.addEventListener('pagehide', stop); window.addEventListener('pageshow', () => { loop(); draw(); });
})();
