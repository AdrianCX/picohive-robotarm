const REACH_GL_KEY = "robotarm.reach.webgl";
const REACH_GL_NEAR = 0.02;
const REACH_GL_FAR = 10.0;

var reachGlWanted = true;
var reachGl = null;
var reachGlBroken = "";
var reachGlQueue = [];

function reachGlOn() {
    if (!reachGlWanted) return false;
    if (reachGl) return true;
    if (reachGlBroken) return false;

    reachGl = reachGlMake();
    return !!reachGl;
}

function reachSetWebgl(on) {
    reachGlWanted = !!on;
    reachGlBroken = "";

    try { localStorage.setItem(REACH_GL_KEY, reachGlWanted ? "1" : "0"); } catch (e) {}

    if (!reachGlWanted) reachGlClear();

    reachPaint();
    reachPaintPanels();
}

function reachGlLoad() {
    try { reachGlWanted = (localStorage.getItem(REACH_GL_KEY) !== "0"); } catch (e) {}
}

function reachGlClear() {
    var canvas = document.getElementById("reachgl");
    var stage = canvas ? canvas.parentNode : null;

    if (stage) stage.classList.remove("reachwithgl");
    if (!reachGl) return;

    reachGl.gl.clearColor(0, 0, 0, 0);
    reachGl.gl.clear(reachGl.gl.COLOR_BUFFER_BIT | reachGl.gl.DEPTH_BUFFER_BIT);
}

const REACH_GL_CAMERA = `
uniform vec3 uEye, uR, uU, uF;
uniform vec2 uScale;
uniform vec3 uLo, uHi;
vec4 reachClip(vec3 p) {
    vec3 v = p - uEye;
    float d = dot(v, uF);
    return vec4(dot(v, uR) * uScale.x, dot(v, uU) * uScale.y,
                d * ${((REACH_GL_FAR + REACH_GL_NEAR) / (REACH_GL_FAR - REACH_GL_NEAR)).toFixed(6)}
                  - ${((2 * REACH_GL_FAR * REACH_GL_NEAR) / (REACH_GL_FAR - REACH_GL_NEAR)).toFixed(6)}, d);
}
vec3 reachXyz(vec3 p) {
    vec3 n = clamp((p - uLo) / (uHi - uLo), 0.0, 1.0);
    return (70.0 + 185.0 * n) / 255.0;
}`;

const REACH_GL_SHADERS = {
    sky: [`#version 300 es
in vec2 aAt;
out vec2 vAt;
void main() { vAt = aAt; gl_Position = vec4(aAt, 0.0, 1.0); }`,
    `#version 300 es
precision highp float;
in vec2 vAt;
uniform vec2 uPool;
uniform float uPoolR;
layout(location = 0) out vec4 oColour;
layout(location = 1) out vec4 oGlow;
void main() {
    vec3 top = vec3(11.0, 16.0, 34.0) / 255.0, bottom = vec3(20.0, 26.0, 48.0) / 255.0;
    vec3 c = mix(bottom, top, vAt.y * 0.5 + 0.5);
    float pool = max(0.0, 1.0 - length(gl_FragCoord.xy - uPool) / uPoolR);
    oColour = vec4(c + vec3(60.0, 140.0, 255.0) / 255.0 * 0.22 * pool, 1.0);
    oGlow = vec4(0.0);
}`],

    floor: [`#version 300 es
in vec3 aPos;
out vec3 vPos;
${REACH_GL_CAMERA}
void main() { vPos = aPos; gl_Position = reachClip(aPos); }`,
    `#version 300 es
precision highp float;
in vec3 vPos;
${REACH_GL_CAMERA}
uniform vec2 uCar;
uniform vec4 uTorch;
uniform float uCarShade;
layout(location = 0) out vec4 oColour;
layout(location = 1) out vec4 oGlow;
void main() {
    vec2 cell = vPos.xy / 0.05;
    vec2 g = abs(fract(cell - 0.5) - 0.5) / fwidth(cell);
    float line = 1.0 - min(min(g.x, g.y), 1.0);
    float fade = max(0.0, 1.0 - length(vPos.xy) / 0.6);
    float a = line * 0.42 * fade;
    vec3 c = reachXyz(vec3(vPos.xy, 0.0));

    float car = (1.0 - smoothstep(0.0, 1.0, length((vPos.xy - uCar) / vec2(0.14, 0.10)))) * uCarShade;

    // The torch's blob shadow: bigger and fainter the higher the torch is.
    float high = clamp(uTorch.z / (uHi.z), 0.0, 1.0);
    float size = 0.07 * (0.7 + 1.2 * high);
    float blob = uTorch.w * (1.0 - smoothstep(0.0, 1.0, length(vPos.xy - uTorch.xy) / size))
               * 0.55 * (1.0 - 0.6 * high);

    vec3 rgb = c * a + reachXyz(vec3(uTorch.xy, 0.0)) * blob;
    float alpha = clamp(a + blob + car * (1.0 - a), 0.0, 1.0);
    oColour = vec4(rgb / max(alpha, 1e-4) * (1.0 - car * 0.8), alpha);
    oGlow = vec4(0.0);
}`],

    walls: [`#version 300 es
in vec3 aPos;
out vec3 vPos;
${REACH_GL_CAMERA}
void main() { vPos = aPos; gl_Position = reachClip(aPos); }`,
    `#version 300 es
precision highp float;
in vec3 vPos;
${REACH_GL_CAMERA}
uniform vec3 uWall;
uniform vec4 uTorch;
layout(location = 0) out vec4 oColour;
layout(location = 1) out vec4 oGlow;
void main() {
    bool xWall = uWall.x < 0.5;
    vec2 w = xWall ? vPos.yz : vPos.xz;
    float across = xWall ? vPos.y : vPos.x;

    vec2 cell = w / 0.05;
    vec2 g = abs(fract(cell - 0.5) - 0.5) / fwidth(cell);
    float line = 1.0 - min(min(g.x, g.y), 1.0);
    float fade = (1.0 - smoothstep(0.30, 0.62, vPos.z)) * (1.0 - smoothstep(0.32, 0.5, abs(across)));

    float floorEdge = 1.0 - smoothstep(0.0, 0.004, vPos.z);
    float cornerEdge = (1.0 - smoothstep(0.0, 0.004, abs(across - uWall.z))) * (1.0 - smoothstep(0.3, 0.62, vPos.z));

    vec3 at = uTorch.xyz;
    vec3 onWall = xWall ? vec3(uWall.y, at.y, at.z) : vec3(at.x, uWall.y, at.z);
    float off = clamp(abs(xWall ? at.x - uWall.y : at.y - uWall.y) / 0.9, 0.0, 1.0);
    // A dot where the torch is, with a halo that grows with distance from the wall.
    float d = length(w - (xWall ? at.yz : at.xz));
    float size = 0.045 * (0.7 + 1.2 * off);
    float spot = 1.0 - smoothstep(0.005, 0.008, d);
    float halo = (1.0 - smoothstep(0.0, 1.0, d / size)) * 0.35 * (1.0 - 0.5 * off);
    float blob = uTorch.w * max(spot * 0.95, halo);

    vec3 place = reachXyz(vPos);
    float panel = 0.16 * fade;
    float grid = line * 0.30 * fade;
    float edges = max(floorEdge, cornerEdge) * 0.5;

    vec3 rgb = vec3(16.0, 24.0, 52.0) / 255.0 * panel + place * (grid + edges) + reachXyz(onWall) * blob;
    float alpha = clamp(panel + grid + edges + blob, 0.0, 1.0);

    oColour = vec4(rgb / max(alpha, 1e-4), alpha);
    oGlow = vec4(reachXyz(onWall) * blob * 0.6, blob);
}`],

    lines: [`#version 300 es
in vec3 aPos;
in vec4 aColour;
out vec4 vColour;
${REACH_GL_CAMERA}
void main() { vColour = aColour; gl_Position = reachClip(aPos); }`,
    `#version 300 es
precision highp float;
in vec4 vColour;
uniform float uLineGlow;
layout(location = 0) out vec4 oColour;
layout(location = 1) out vec4 oGlow;
void main() { oColour = vColour; oGlow = vec4(vColour.rgb * uLineGlow, vColour.a); }`],

    solid: [`#version 300 es
in vec3 aPos;
in vec3 aNormal;
in vec4 aLook;
in vec4 aEdgeColour;
in vec3 aEdge;
out vec3 vPos, vNormal, vEdge;
out vec4 vLook, vEdgeColour;
${REACH_GL_CAMERA}
void main() {
    vPos = aPos;
    vNormal = aNormal;
    vLook = aLook;
    vEdgeColour = aEdgeColour;
    vEdge = aEdge;
    gl_Position = reachClip(vPos);
}`,
    `#version 300 es
precision highp float;
in vec3 vPos, vNormal, vEdge;
in vec4 vLook, vEdgeColour;
${REACH_GL_CAMERA}
uniform vec3 uLight;
uniform vec4 uTorch;
uniform vec3 uTorchRgb;
uniform vec4 uHolo;
layout(location = 0) out vec4 oColour;
layout(location = 1) out vec4 oGlow;
void main() {
    vec3 n = normalize(vNormal);
    vec3 view = normalize(vPos - uEye);
    if (dot(n, view) > 0.0) n = -n;

    float lit = max(0.0, dot(n, uLight));
    float rim = pow(1.0 - abs(dot(n, view)), 3.0);

    vec3 w = fwidth(vEdge);
    vec3 e = smoothstep(vec3(0.0), w * 1.3, vEdge);
    float edge = 1.0 - min(min(e.x, e.y), e.z);

    if (uHolo.a > 0.0) {
        float a = (0.06 + 0.14 * lit) + edge * (0.35 + 0.45 * rim);
        oColour = vec4(uHolo.rgb, a * uHolo.a);
        oGlow = vec4(uHolo.rgb * edge * 0.6, a * uHolo.a);
        return;
    }

    vec3 toTorch = uTorch.xyz - vPos;
    float far = length(toTorch);
    float torch = uTorch.w * max(0.0, dot(n, toTorch / max(far, 1e-4))) * clamp(1.0 - far / 0.35, 0.0, 1.0);

    float emit = vLook.a;
    vec3 c = vLook.rgb * (emit + (1.0 - emit) * (0.30 + 0.70 * lit))
           + vec3(80.0, 200.0, 255.0) / 255.0 * 0.55 * rim
           + uTorchRgb * torch * 0.6;

    oColour = vec4(mix(min(c, 1.0), vEdgeColour.rgb, edge * vEdgeColour.a), 1.0);
    oGlow = vec4(vLook.rgb * emit * emit, 1.0);
}`],

    shadow: [`#version 300 es
in vec3 aPos;
uniform vec3 uSun;
${REACH_GL_CAMERA}
void main() {
    vec3 p = aPos;
    vec3 q = p - uSun * (p.z / uSun.z);
    gl_Position = reachClip(vec3(q.xy, 0.001));
}`,
    `#version 300 es
precision highp float;
layout(location = 0) out vec4 oColour;
layout(location = 1) out vec4 oGlow;
void main() { oColour = vec4(0.0, 0.0, 0.02, 0.38); oGlow = vec4(0.0); }`],

    copy: [`#version 300 es
in vec2 aAt;
out vec2 vUv;
void main() { vUv = aAt * 0.5 + 0.5; gl_Position = vec4(aAt, 0.0, 1.0); }`,
    `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uFrom;
layout(location = 0) out vec4 oColour;
void main() { oColour = texture(uFrom, vUv); }`],

    blur: [`#version 300 es
in vec2 aAt;
out vec2 vUv;
void main() { vUv = aAt * 0.5 + 0.5; gl_Position = vec4(aAt, 0.0, 1.0); }`,
    `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uFrom;
uniform vec2 uStep;
layout(location = 0) out vec4 oColour;
void main() {
    float w[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
    vec3 c = texture(uFrom, vUv).rgb * w[0];
    for (int i = 1; i < 5; ++i) {
        c += texture(uFrom, vUv + uStep * float(i) * 1.5).rgb * w[i];
        c += texture(uFrom, vUv - uStep * float(i) * 1.5).rgb * w[i];
    }
    oColour = vec4(c, 1.0);
}`],

    composite: [`#version 300 es
in vec2 aAt;
out vec2 vUv;
void main() { vUv = aAt * 0.5 + 0.5; gl_Position = vec4(aAt, 0.0, 1.0); }`,
    `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene, uGlow, uWide;
layout(location = 0) out vec4 oColour;
void main() {
    vec3 c = texture(uScene, vUv).rgb + texture(uGlow, vUv).rgb * 1.1 + texture(uWide, vUv).rgb * 0.9;
    oColour = vec4(min(c, 1.0), 1.0);
}`],

    dots: [`#version 300 es
in vec2 aCorner;
in vec4 aDot;
${REACH_GL_CAMERA}
uniform float uFocal;
uniform vec2 uPx;
uniform vec4 uTorch;
uniform vec3 uMode;
uniform vec2 uDepth;
uniform float uDotScale;
out vec2 vAt;
out float vReach, vLit, vBack, vRoom;
void main() {
    vec4 c = reachClip(aDot.xyz);
    float lit = 1.0;

    if (mod(uMode.x, 2.0) < 0.5) {
        float d = length(aDot.xyz - uTorch.xyz) / uTorch.w;
        lit = (uTorch.w <= 0.0 || d >= 1.0) ? 0.0 : 1.0 - d * d;
    }

    if (lit <= 0.0 || c.w < ${REACH_GL_NEAR.toFixed(3)}) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }

    float plane = uMode.y, haze = uMode.z;
    float back = (plane > 0.5) ? 0.0 : clamp((c.w - uDepth.x) / max(uDepth.y - uDepth.x, 1e-6), 0.0, 1.0);
    float size = uFocal / c.w;
    float radius = (haze > 0.5) ? max(0.8, 0.0022 * size)
                 : ((plane > 0.5) ? clamp(0.0042 * size, 2.2, 5.5)
                                  : clamp(0.0026 * size, 1.1, 3.4) * (1.0 - 0.45 * back) * uDotScale);

    radius *= (haze > 0.5) ? 1.0 : (0.6 + 0.4 * lit);

    float extent = radius * 2.4;

    vAt = aCorner * 2.4;
    vReach = (aDot.w >= 0.0) ? 1.0 : 0.0;
    vLit = lit;
    vBack = back;
    vRoom = clamp((aDot.w - ${REACH_TIGHT.toFixed(1)}) / ${(REACH_EASY - REACH_TIGHT).toFixed(1)}, 0.0, 1.0);

    gl_Position = c + vec4(aCorner * extent * uPx * c.w, 0.0, 0.0);
}`,
    `#version 300 es
precision highp float;
in vec2 vAt;
in float vReach, vLit, vBack, vRoom;
uniform vec3 uMode;
uniform float uGlowAmt;
layout(location = 0) out vec4 oColour;
layout(location = 1) out vec4 oGlow;
vec3 hsl(float h, float s, float l) {
    vec3 k = mod(vec3(0.0, 8.0, 4.0) + h / 30.0, 12.0);
    float a = s * min(l, 1.0 - l);
    return l - a * max(min(min(k - 3.0, 9.0 - k), 1.0), -1.0);
}
void main() {
    float r = length(vAt);

    oGlow = vec4(0.0);

    if (uMode.z > 0.5) {
        if ((r > 1.0) || (vReach < 0.5)) discard;
        oColour = vec4(120.0 / 255.0, 170.0 / 255.0, 1.0, 0.20);
        return;
    }

    // Out of reach: a small grey ring.
    if (vReach < 0.5) {
        float ring = 1.0 - smoothstep(0.12, 0.3, abs(r - 0.85));
        if (ring <= 0.0) discard;
        oColour = vec4(170.0 / 255.0, 185.0 / 255.0, 215.0 / 255.0, 0.45 * vLit * ring);
        return;
    }

    float hue = 38.0 + 122.0 * vRoom;
    vec3 core = hsl(hue, 0.85, 0.60);
    float alpha = ((uMode.y > 0.5) ? 1.0 : (0.85 - 0.7 * vBack)) * vLit;

    if (r <= 1.0) {
        float spot = 1.0 - smoothstep(0.25, 0.4, length(vAt + vec2(0.3, -0.3)));
        bool bright = (vBack < 0.25) && (vLit > 0.3);
        vec3 c = bright ? mix(core, vec3(1.0), spot * 0.5 * vLit) : core;
        oColour = vec4(c, alpha * (1.0 - smoothstep(0.85, 1.0, r) * 0.5));
        oGlow = vec4(core * uGlowAmt * vLit * (1.0 - vBack), oColour.a);
        return;
    }

    if ((uMode.x > 1.5) || (vBack >= 0.25) || (vLit <= 0.3) || (r > 2.4)) discard;

    float halo = (1.0 - (r - 1.0) / 1.4) * 0.14 * (1.0 - 4.0 * vBack);
    oColour = vec4(hsl(hue, 0.9, 0.55), halo);
}`],
};

function reachGlMake() {
    var canvas = document.getElementById("reachgl");
    if (!canvas) return null;

    var gl = null;

    try { gl = canvas.getContext("webgl2", { antialias: false, stencil: true, premultipliedAlpha: false }); }
    catch (e) { gl = null; }

    if (!gl) { reachGlBroken = "this browser has no WebGL2"; return null; }

    if (!reachGridChosen && (reachGridMm === 30)) reachGridMm = 20;

    var made = { gl: gl, programs: {}, buffers: {}, lattice: null, slice: null,
                 targets: null, bloom: true, samples: 1 };

    try {
        for (var name in REACH_GL_SHADERS) {
            made.programs[name] = reachGlProgram(gl, REACH_GL_SHADERS[name][0], REACH_GL_SHADERS[name][1]);
        }
    }
    catch (e) {
        reachGlBroken = "the shaders would not build: " + e.message;
        reachNote("WebGL off - " + reachGlBroken);
        return null;
    }

    made.buffers.sky = reachGlBuffer(gl, new Float32Array([-1, -1, 3, -1, -1, 3]));
    made.buffers.floor = reachGlBuffer(gl, new Float32Array([-0.6, -0.6, 0, 0.6, -0.6, 0, 0.6, 0.6, 0,
                                                             -0.6, -0.6, 0, 0.6, 0.6, 0, -0.6, 0.6, 0]));
    made.buffers.corner = reachGlBuffer(gl, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]));
    made.buffers.lines = gl.createBuffer();
    made.buffers.solids = gl.createBuffer();
    made.vao = gl.createVertexArray();

    reachGlHook(canvas);

    return made;
}

function reachGlHook(canvas) {
    if (canvas.reachGlHooked) return;

    canvas.reachGlHooked = true;

    canvas.addEventListener("webglcontextlost", function (e) {
        e.preventDefault();
        reachGl = null;
        reachGlBroken = "the GPU took it back - drawn in 2D until it returns";
        reachPaint();
        reachPaintPanels();
    });

    canvas.addEventListener("webglcontextrestored", function () {
        reachGlBroken = "";
        reachPaint();
        reachPaintPanels();
    });
}

function reachGlTargets(gl, made, w, h) {
    var t = made.targets;

    if (t && (t.w === w) && (t.h === h)) return t;

    if (t) {
        t.objects.forEach(function (o) {
            if (o instanceof WebGLTexture) gl.deleteTexture(o);
            else if (o instanceof WebGLRenderbuffer) gl.deleteRenderbuffer(o);
            else gl.deleteFramebuffer(o);
        });
    }

    t = { w: w, h: h, objects: [] };
    made.targets = t;
    made.samples = 1;

    var keep = function (o) { t.objects.push(o); return o; };

    var buffer = function (format) {
        var rb = keep(gl.createRenderbuffer());
        gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
        if (made.samples > 1) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, made.samples, format, w, h);
        else gl.renderbufferStorage(gl.RENDERBUFFER, format, w, h);
        return rb;
    };

    var texture = function (tw, th) {
        var tex = keep(gl.createTexture());
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return tex;
    };

    var frame = function (attach) {
        var fb = keep(gl.createFramebuffer());
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        attach();
        return fb;
    };

    t.draw = frame(function () {
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, buffer(gl.RGBA8));
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.RENDERBUFFER, buffer(gl.RGBA8));
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER,
                                   buffer(gl.DEPTH24_STENCIL8));
    });
    var drawOk = (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE);

    t.scene = texture(w, h);
    t.glow = texture(w, h);
    t.resolve = frame(function () {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.scene, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, t.glow, 0);
    });
    var resolveOk = (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE);

    t.hw = Math.max(1, w >> 1); t.hh = Math.max(1, h >> 1);
    t.qw = Math.max(1, w >> 2); t.qh = Math.max(1, h >> 2);
    t.half = [texture(t.hw, t.hh), texture(t.hw, t.hh)];
    t.quarter = [texture(t.qw, t.qh), texture(t.qw, t.qh)];
    t.halfFb = t.half.map(function (tex) {
        return frame(function () { gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); });
    });
    t.quarterFb = t.quarter.map(function (tex) {
        return frame(function () { gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); });
    });

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);

    made.bloom = drawOk && resolveOk;
    return t;
}

function reachGlProgram(gl, vs, fs) {
    var make = function (kind, text) {
        var s = gl.createShader(kind);
        gl.shaderSource(s, text);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
    };

    var p = gl.createProgram();
    gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);

    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));

    var out = { p: p, u: {}, a: {} };
    var count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);

    for (var i = 0; i < count; ++i) {
        var u = gl.getActiveUniform(p, i);
        out.u[u.name] = gl.getUniformLocation(p, u.name);
    }

    count = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);

    for (var k = 0; k < count; ++k) {
        var a = gl.getActiveAttrib(p, k);
        out.a[a.name] = gl.getAttribLocation(p, a.name);
    }

    return out;
}

function reachGlBuffer(gl, data) {
    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buffer;
}

function reachGlLayout(gl, prog, buffer, layout, perInstance, wide) {
    var stride = 0;
    for (var i = 0; i < layout.length; ++i) stride += layout[i][1];
    if (wide) stride = wide;

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

    var at = 0;

    for (var k = 0; k < layout.length; ++k) {
        var loc = prog.a[layout[k][0]];

        if ((loc !== undefined) && (loc >= 0)) {
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, layout[k][1], gl.FLOAT, false, stride * 4, at * 4);
            gl.vertexAttribDivisor(loc, perInstance ? 1 : 0);
        }

        at += layout[k][1];
    }
}

function reachGlCamera(gl, prog, b) {
    var span = REACH.upper + REACH.fore + REACH.tip;

    gl.uniform3f(prog.u.uEye, b.eye.x, b.eye.y, b.eye.z);
    gl.uniform3f(prog.u.uR, b.r.x, b.r.y, b.r.z);
    gl.uniform3f(prog.u.uU, b.u.x, b.u.y, b.u.z);
    gl.uniform3f(prog.u.uF, b.f.x, b.f.y, b.f.z);
    gl.uniform2f(prog.u.uScale, (2 * b.focal) / reachCanvasSize.w, (2 * b.focal) / reachCanvasSize.h);
    gl.uniform3f(prog.u.uLo, -span, -span, 0);
    gl.uniform3f(prog.u.uHi, span, span, REACH.plateZ + REACH.shoulderZ + span);
}

function reachGlFaces(faces, out) {
    for (var i = 0; i < faces.length; ++i) {
        var face = faces[i];
        var pts = face.pts;
        var look = face.look;
        var n = reachUnit(reachCross(reachSub(pts[1], pts[0]), reachSub(pts[2], pts[0])));
        var mid = { x: 0, y: 0, z: 0 };

        for (var k = 0; k < pts.length; ++k) mid = reachAdd(mid, pts[k], 1 / pts.length);
        if (reachDotP(n, reachSub(mid, face.centre)) < 0) n = { x: -n.x, y: -n.y, z: -n.z };

        var edge = look.edgeRgba || (look.edgeRgba = reachGlRgba(look.edge));
        var rgb = look.rgb;

        for (var t = 1; t < pts.length - 1; ++t) {
            var firstSide = (t === 1), lastSide = (t === pts.length - 2);
            var corners = [pts[0], pts[t], pts[t + 1]];
            var bary = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
            var off = [0, lastSide ? 0 : 1, firstSide ? 0 : 1];

            for (var c = 0; c < 3; ++c) {
                var p = corners[c];

                out.push(p.x, p.y, p.z, n.x, n.y, n.z,
                         rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, look.emit,
                         edge[0], edge[1], edge[2], edge[3],
                         bary[c][0] + off[0], bary[c][1] + off[1], bary[c][2] + off[2]);
            }
        }
    }

    return out;
}

const REACH_GL_SOLID = [["aPos", 3], ["aNormal", 3], ["aLook", 4], ["aEdgeColour", 4], ["aEdge", 3]];

function reachGlRgba(css) {
    var m = /rgba?\(([^)]+)\)/.exec(css || "");
    if (!m) return [0, 0, 0, 0];

    var v = m[1].split(",").map(parseFloat);
    return [v[0] / 255, v[1] / 255, v[2] / 255, (v.length > 3) ? v[3] : 1];
}

function reachGlLines() {
    var out = [];
    var reach = REACH.upper + REACH.fore + REACH.tip;
    var cz = REACH.plateZ + REACH.shoulderZ;
    var from = reachBand[0][0] * Math.PI / 180, to = reachBand[0][1] * Math.PI / 180;
    var step = Math.PI / 36;

    var seg = function (a, c, rgba) {
        out.push(a.x, a.y, a.z, rgba[0], rgba[1], rgba[2], rgba[3],
                 c.x, c.y, c.z, rgba[0], rgba[1], rgba[2], rgba[3]);
    };
    var blue = function (alpha) { return [110 / 255, 190 / 255, 1, alpha]; };

    var ring = function (z, radius, rgba) {
        for (var a = from; a + step <= to + 1e-9; a += step) {
            seg({ x: radius * Math.cos(a), y: radius * Math.sin(a), z: z },
                { x: radius * Math.cos(a + step), y: radius * Math.sin(a + step), z: z }, rgba);
        }
    };

    ring(cz, reach, blue(0.28));
    if (reach > cz) ring(0, Math.sqrt((reach * reach) - (cz * cz)), blue(0.22));

    for (var up = 30; up <= 60; up += 30) {
        var t = up * Math.PI / 180;
        ring(cz + (reach * Math.sin(t)), reach * Math.cos(t), blue(0.12));
    }

    var edges = [reachBand[0][0], reachBand[0][1]];
    for (var turn = Math.ceil(reachBand[0][0] / 45) * 45; turn <= reachBand[0][1]; turn += 45) edges.push(turn);

    for (var m = 0; m < edges.length; ++m) {
        var c = Math.cos(edges[m] * Math.PI / 180), s = Math.sin(edges[m] * Math.PI / 180);
        var rgba = (m < 2) ? [1, 80 / 255, 140 / 255, 0.55] : blue(0.12);

        for (var e = 0; e < 90; e += 5) {
            var a1 = e * Math.PI / 180, a2 = (e + 5) * Math.PI / 180;
            seg({ x: reach * Math.cos(a1) * c, y: reach * Math.cos(a1) * s, z: cz + reach * Math.sin(a1) },
                { x: reach * Math.cos(a2) * c, y: reach * Math.cos(a2) * s, z: cz + reach * Math.sin(a2) }, rgba);
        }
    }

    var fwd = [120 / 255, 220 / 255, 1, 0.55];
    seg({ x: 0.12, y: 0, z: 0 }, { x: 0.30, y: 0, z: 0 }, fwd);
    seg({ x: 0.30, y: 0, z: 0 }, { x: 0.27, y: 0.015, z: 0 }, fwd);
    seg({ x: 0.30, y: 0, z: 0 }, { x: 0.27, y: -0.015, z: 0 }, fwd);

    return new Float32Array(out);
}

function reachGlDots(gl, points) {
    var data = new Float32Array(points.length * 4);

    for (var i = 0; i < points.length; ++i) {
        data[i * 4] = points[i].x;
        data[(i * 4) + 1] = points[i].y;
        data[(i * 4) + 2] = points[i].z;
        data[(i * 4) + 3] = points[i].margin;
    }

    return { buffer: reachGlBuffer(gl, data), count: points.length, from: points };
}

function reachGlDraw(b, scene) {
    var made = reachGl;
    var gl = made.gl;
    var canvas = gl.canvas;
    var ratio = window.devicePixelRatio || 1;
    var w = Math.round(reachCanvasSize.w * ratio), h = Math.round(reachCanvasSize.h * ratio);

    if ((canvas.width !== w) || (canvas.height !== h)) { canvas.width = w; canvas.height = h; }

    canvas.parentNode.classList.add("reachwithgl");

    var t = reachGlTargets(gl, made, w, h);

    gl.bindFramebuffer(gl.FRAMEBUFFER, made.bloom ? t.draw : null);
    if (made.bloom) gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

    gl.viewport(0, 0, w, h);
    gl.bindVertexArray(made.vao);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.STENCIL_TEST);
    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(1);
    gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

    var torch = scene.torch;
    var torchRgb = torch ? reachXyzRgb(torch).split(",").map(function (v) { return v / 255; }) : [0, 0, 0];

    var prog = made.programs.sky;
    var pool = reachProject(b, { x: 0, y: 0, z: 0 });
    var poolFar = reachProject(b, { x: 0.45, y: 0, z: 0 });

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(prog.p);
    reachGlUnbind(gl, made);
    reachGlLayout(gl, prog, made.buffers.sky, [["aAt", 2]]);
    gl.uniform2f(prog.u.uPool, pool ? pool.x * ratio : -1e4, pool ? h - (pool.y * ratio) : -1e4);
    gl.uniform1f(prog.u.uPoolR, (pool && poolFar)
        ? Math.max(80, Math.hypot(poolFar.x - pool.x, poolFar.y - pool.y) * 1.4) * ratio : 300 * ratio);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    prog = made.programs.floor;
    gl.useProgram(prog.p);
    reachGlUnbind(gl, made);
    reachGlCamera(gl, prog, b);
    reachGlLayout(gl, prog, made.buffers.floor, [["aPos", 3]]);
    var car = reachOnCar({ x: REACH.carBack, y: 0, z: 0 });
    gl.uniform2f(prog.u.uCar, car.x, car.y);
    gl.uniform1f(prog.u.uCarShade, 0.3);
    gl.uniform4f(prog.u.uTorch, torch ? torch.x : 0, torch ? torch.y : 0, torch ? torch.z : 0,
                 (torch && torch.z > 0) ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    reachGlWalls(gl, made, b, torch);

    var solid = [];
    for (var s = 0; s < scene.solids.length; ++s) reachGlFaces(scene.solids[s], solid);

    reachGlShadows(gl, made, b, solid);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    prog = made.programs.solid;
    gl.useProgram(prog.p);
    reachGlCamera(gl, prog, b);
    gl.uniform3f(prog.u.uLight, REACH_LIGHT.x, REACH_LIGHT.y, REACH_LIGHT.z);
    gl.uniform4f(prog.u.uTorch, torch ? torch.x : 0, torch ? torch.y : 0, torch ? torch.z : 0, torch ? 1 : 0);
    gl.uniform3f(prog.u.uTorchRgb, torchRgb[0], torchRgb[1], torchRgb[2]);
    gl.uniform4f(prog.u.uHolo, 0, 0, 0, 0);
    reachGlSolids(gl, made, prog, solid);

    gl.enable(gl.BLEND);
    gl.depthMask(false);

    prog = made.programs.lines;
    gl.useProgram(prog.p);
    reachGlUnbind(gl, made);
    reachGlCamera(gl, prog, b);
    gl.uniform1f(prog.u.uLineGlow, 0);

    var lines = reachGlLines();
    gl.bindBuffer(gl.ARRAY_BUFFER, made.buffers.lines);
    gl.bufferData(gl.ARRAY_BUFFER, lines, gl.DYNAMIC_DRAW);
    reachGlLayout(gl, prog, made.buffers.lines, [["aPos", 3], ["aColour", 4]]);
    gl.drawArrays(gl.LINES, 0, lines.length / 7);

    if (torch && !reachShowAll) {
        var ball = reachGlBall(torch, torchRgb);

        gl.uniform1f(prog.u.uLineGlow, 0.8);
        gl.bufferData(gl.ARRAY_BUFFER, ball, gl.DYNAMIC_DRAW);
        reachGlLayout(gl, prog, made.buffers.lines, [["aPos", 3], ["aColour", 4]]);
        gl.drawArrays(gl.LINES, 0, ball.length / 7);
    }

    reachGlDrawDots(gl, made, b, scene, torch);

    prog = made.programs.solid;
    gl.useProgram(prog.p);

    for (var g = 0; g < scene.holos.length; ++g) {
        var holo = scene.holos[g];
        var rgb = holo.rgb.split(",").map(function (v) { return v / 255; });

        gl.uniform4f(prog.u.uHolo, rgb[0], rgb[1], rgb[2], holo.alpha);
        reachGlSolids(gl, made, prog, reachGlFaces(holo.faces, []));
    }

    gl.depthMask(true);

    if (made.bloom) reachGlBloom(gl, made, t, w, h);

    gl.bindVertexArray(null);
}

function reachGlWalls(gl, made, b, torch) {
    var W = REACH_WALL, H = REACH_WALL_H;
    var xAt = (b.eye.x > 0) ? -W : W;
    var yAt = (b.eye.y > 0) ? -W : W;
    var prog = made.programs.walls;

    if (!made.buffers.walls) made.buffers.walls = gl.createBuffer();

    gl.useProgram(prog.p);
    reachGlUnbind(gl, made);
    reachGlCamera(gl, prog, b);
    gl.uniform4f(prog.u.uTorch, torch ? torch.x : 0, torch ? torch.y : 0, torch ? torch.z : 0, torch ? 1 : 0);

    var wall = function (axis, at, corner, corners) {
        gl.bindBuffer(gl.ARRAY_BUFFER, made.buffers.walls);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(corners), gl.DYNAMIC_DRAW);
        reachGlLayout(gl, prog, made.buffers.walls, [["aPos", 3]]);
        gl.uniform3f(prog.u.uWall, axis, at, corner);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    wall(0, xAt, yAt, [xAt, -W, 0, xAt, W, 0, xAt, W, H, xAt, -W, 0, xAt, W, H, xAt, -W, H]);
    wall(1, yAt, xAt, [-W, yAt, 0, W, yAt, 0, W, yAt, H, -W, yAt, 0, W, yAt, H, -W, yAt, H]);
}

const REACH_GL_SUN = { x: 0.18, y: 0.12, z: 1.0 };

function reachGlShadows(gl, made, b, solid) {
    var prog = made.programs.shadow;

    gl.useProgram(prog.p);
    reachGlCamera(gl, prog, b);
    gl.uniform3f(prog.u.uSun, REACH_GL_SUN.x, REACH_GL_SUN.y, REACH_GL_SUN.z);

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.EQUAL, 0, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    if (solid.length) {
        reachGlUnbind(gl, made);
        gl.bindBuffer(gl.ARRAY_BUFFER, made.buffers.solids);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(solid), gl.DYNAMIC_DRAW);
        reachGlLayout(gl, prog, made.buffers.solids, [["aPos", 3]], false, 17);
        gl.drawArrays(gl.TRIANGLES, 0, solid.length / 17);
    }

    gl.disable(gl.STENCIL_TEST);
}

function reachGlBall(at, rgb) {
    var out = [];
    var r = REACH_TORCH_R;
    var n = 32;

    for (var plane = 0; plane < 3; ++plane) {
        for (var i = 0; i < n; ++i) {
            for (var k = 0; k < 2; ++k) {
                var a = ((i + k) * Math.PI * 2) / n;
                var c = Math.cos(a) * r, s = Math.sin(a) * r;
                var p = (plane === 0) ? [c, s, 0] : ((plane === 1) ? [c, 0, s] : [0, c, s]);

                out.push(at.x + p[0], at.y + p[1], at.z + p[2], rgb[0], rgb[1], rgb[2], 0.55);
            }
        }
    }

    return new Float32Array(out);
}

function reachGlBloom(gl, made, t, w, h) {
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, t.draw);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, t.resolve);

    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);

    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.drawBuffers([gl.NONE, gl.COLOR_ATTACHMENT1]);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);

    var pass = function (prog, into, iw, ih, from, setup) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, into);
        if (into) gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
        gl.viewport(0, 0, iw, ih);
        gl.useProgram(prog.p);
        reachGlUnbind(gl, made);
        reachGlLayout(gl, prog, made.buffers.sky, [["aAt", 2]]);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, from);
        gl.uniform1i(prog.u.uFrom, 0);
        if (setup) setup(prog);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    var blur = made.programs.blur;
    var blurAt = function (tex, fbs, iw, ih, from) {
        pass(made.programs.copy, fbs[0], iw, ih, from);
        pass(blur, fbs[1], iw, ih, tex[0], function (p) { gl.uniform2f(p.u.uStep, 1 / iw, 0); });
        pass(blur, fbs[0], iw, ih, tex[1], function (p) { gl.uniform2f(p.u.uStep, 0, 1 / ih); });
    };

    blurAt(t.half, t.halfFb, t.hw, t.hh, t.glow);
    blurAt(t.quarter, t.quarterFb, t.qw, t.qh, t.half[0]);

    var prog = made.programs.composite;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog.p);
    reachGlUnbind(gl, made);
    reachGlLayout(gl, prog, made.buffers.sky, [["aAt", 2]]);

    var unit = 0;
    [["uScene", t.scene], ["uGlow", t.half[0]], ["uWide", t.quarter[0]]].forEach(function (bind) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, bind[1]);
        gl.uniform1i(prog.u[bind[0]], unit);
        ++unit;
    });

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
}

function reachGlUnbind(gl, made) {
    if (!made.attribs) made.attribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);

    for (var i = 0; i < made.attribs; ++i) {
        gl.disableVertexAttribArray(i);
        gl.vertexAttribDivisor(i, 0);
    }
}

function reachGlSolids(gl, made, prog, data) {
    if (!data.length) return;

    reachGlUnbind(gl, made);
    gl.bindBuffer(gl.ARRAY_BUFFER, made.buffers.solids);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW);
    reachGlLayout(gl, prog, made.buffers.solids, REACH_GL_SOLID);
    gl.drawArrays(gl.TRIANGLES, 0, data.length / 17);
}

function reachGlDrawDots(gl, made, b, scene, torch) {
    if ((made.lattice === null) || (made.lattice.from !== reachLattice)
        || (made.lattice.count !== reachLattice.length)) {
        if (made.lattice) gl.deleteBuffer(made.lattice.buffer);
        made.lattice = reachGlDots(gl, reachLattice);
    }

    if ((made.slice === null) || (made.slice.from !== reachSlice)) {
        if (made.slice) gl.deleteBuffer(made.slice.buffer);
        made.slice = reachGlDots(gl, reachSlice);
    }

    var prog = made.programs.dots;
    gl.useProgram(prog.p);
    reachGlCamera(gl, prog, b);
    gl.uniform1f(prog.u.uFocal, b.focal);
    gl.uniform2f(prog.u.uPx, 2 / reachCanvasSize.w, 2 / reachCanvasSize.h);
    gl.uniform4f(prog.u.uTorch, torch ? torch.x : 0, torch ? torch.y : 0, torch ? torch.z : 0,
                 torch ? REACH_TORCH_R : 0);
    gl.uniform2f(prog.u.uDepth, scene.near, scene.far);

    gl.uniform1f(prog.u.uDotScale, Math.max(0.5, Math.min(1, reachGridMm / 30)));
    gl.uniform1f(prog.u.uGlowAmt, reachShowAll ? 0.08 : 0.7);

    var draw = function (set, plane, haze) {
        if (!set.count) return;

        gl.uniform3f(prog.u.uMode, (reachShowAll ? 1 : 0) + (made.bloom ? 2 : 0), plane ? 1 : 0, haze ? 1 : 0);
        reachGlUnbind(gl, made);
        reachGlLayout(gl, prog, made.buffers.corner, [["aCorner", 2]]);
        reachGlLayout(gl, prog, set.buffer, [["aDot", 4]], true);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, set.count);
    };

    if (reachLock) {
        if (reachShowAll) draw(made.lattice, false, true);
        draw(made.slice, true, false);
    }
    else draw(made.lattice, false, false);
}
