const REACH_POLL_MS = 250;
var reachTimer = null;

const REACH = {
    upper: 0.1160,
    fore: 0.1350,
    tip: 0.1000,
    shoulderZ: 0.1190,
    shoulderR: 0.0306,

    carL: 0.160, carW: 0.110, carH: 0.033,
    carBack: 0.075,

    mount: 180,

    wheelR: 0.048, wheelW: 0.038, wheelRim: 0.024,
    wheelBase: 0.130, wheelTrack: 0.147,
    plateZ: 0.066,
};

const REACH_CLEARANCE = 0.02;

const REACH_WIDE = [[-110, 110], [-150, 150], [-150, 150], [-150, 150]];

const REACH_MECH = [[-114.5, 114.5], [-89.2, 111.4], [-16.2, 163.8], [-108.3, 103.7],
                    [-180.0, 180.0], [-11.5, 114.6]];

const REACH_MECH_MIRRORED = [[-114.5, 114.5], [-111.4, 89.2], [-163.8, 16.2], [-103.7, 108.3]];

const REACH_JOINTS = 6;

const REACH_SLOP = 2.0;

const REACH_TIGHT = 10;
const REACH_EASY = 30;

var reachBand = REACH_WIDE;
var reachBandIsReal = false;
var reachShape = "";

var reachCam = { yaw: -0.9, pitch: 0.42, dist: 1.0 };
var reachLook = { x: 0.0, y: 0.0, z: 0.20 };

var reachLock = "";
var reachLockAt = 0;
const REACH_SLICE_MM = 20;

var reachGridMm = 30;
var reachGridChosen = false;
var reachBuild = null;
var reachLattice = [];
var reachSlice = [];
var reachPlaneShape = "";
var reachScreen = [];
var reachHover = -1;
function reachLive() { return reachLock ? reachSlice : reachLattice; }

const REACH_WALL = 0.5;
const REACH_WALL_H = 0.62;

const REACH_TORCH_R = 0.07;
const REACH_TORCH_STEP = 0.025;
var reachTorchIn = 0;
var reachTorchNow = null;
const REACH_SHOWALL_KEY = "robotarm.reach.showall";
var reachShowAll = false;
var reachMouse = null;

var reachTarget = null;
var reachAsked = null;
var reachSolution = null;
var reachDrag = null;
var reachCanvasSize = { w: 0, h: 0 };

var reachZero = null;
var reachSign = [1, 1, 1, 1, 1, 1];

const REACH_KEY = "robotarm.reach.zero";

const REACH_POSES = [
    { name: "Straight up", q: [0, 0, 0, 0],
      how: "turn forward \u00B7 upper arm UP \u00B7 forearm UP \u00B7 gripper UP" },
    { name: "Up, turned left", q: [90, 0, 0, 0],
      how: "turn LEFT \u00B7 upper arm up \u00B7 forearm up \u00B7 gripper up" },
    { name: "All up, turned right", q: [-90, 0, 0, 0],
      how: "turn RIGHT \u00B7 upper arm up \u00B7 forearm up \u00B7 gripper up" },
    { name: "Straight forward", q: [0, 90, 0, 0],
      how: "turn forward \u00B7 upper arm FORWARD \u00B7 forearm FORWARD \u00B7 gripper FORWARD" },
    { name: "Up, forearm forward", q: [0, 0, 90, 0],
      how: "turn forward \u00B7 upper arm up \u00B7 forearm FORWARD, level \u00B7 gripper FORWARD" },
    { name: "Forward, gripper down", q: [0, 90, 0, 90],
      how: "turn forward \u00B7 upper arm forward \u00B7 forearm forward \u00B7 gripper DOWN" },
    { name: "Forward, gripper up", q: [0, 90, 0, -90],
      how: "turn forward \u00B7 upper arm forward \u00B7 forearm forward \u00B7 gripper UP" },
    { name: "Up, forward, gripper down", q: [0, 0, 90, 90],
      how: "turn forward \u00B7 upper arm up \u00B7 forearm forward, level \u00B7 gripper DOWN" },
];

function reachPosePossible(which) {
    var q = REACH_POSES[which].q;

    for (var j = 1; j < 4; ++j) {
        if ((q[j] < REACH_MECH[j][0] - REACH_SLOP) || (q[j] > REACH_MECH[j][1] + REACH_SLOP)) {
            return ["pan", "lift", "elbow", "wrist"][j] + " cannot go to " + q[j] + "\u00B0";
        }
    }

    return "";
}

var reachCaptured = {};
var reachShowPose = -1;
var reachScale = [1, 1, 1, 1];
var reachTrouble = [];
var reachZeroFrom = "";
var reachGuessed = [false, false, false, false, false, false];
var reachOneShot = false;
var reachForwardRead = null;
var reachAskedArm = false;
var reachDirect = true;
var reachOnArm = false;

const REACH_DIRECT_KEY = "robotarm.reach.direct";
var reachSignChoice = [1, 1, 1, 1, 1, 1];

const REACH_SIGN_KEY = "robotarm.reach.signs";

var reachStateAt = 0;
var reachWaiting = -1;

function reachVisible() {
    var tab = document.getElementById("Reach");
    return tab && (tab.style.display === "block");
}

function reachLimits() {
    if (!reachZero || !armState.length) {
        reachBandIsReal = false;
        return REACH_MECH;
    }

    var out = [];
    var real = true;

    for (var j = 0; j < 4; ++j) {
        var joint = armState[j];

        if (!joint || !joint.here || !joint.cal) {
            out.push(REACH_MECH[j]);
            real = false;
            continue;
        }

        var a = ((joint.mindeci / 10) - reachZero[j]) * reachSign[j];
        var b = ((joint.maxdeci / 10) - reachZero[j]) * reachSign[j];

        out.push([Math.min(a, b), Math.max(a, b)]);
    }

    reachBandIsReal = real;
    return out;
}

function reachMirroredCalibration() {
    if (!reachZero || (armState.length < 4)) return false;

    for (var j = 1; j < 4; ++j) {
        var joint = armState[j];
        if (!joint || !joint.cal) return false;

        var low = joint.mindeci / 10;
        var was = (reachSign[j] > 0) ? (low - REACH_MECH_MIRRORED[j][0])
                                     : (low + REACH_MECH_MIRRORED[j][1]);

        if (Math.abs(reachZero[j] - was) > 0.15) return false;
    }

    return true;
}

function reachCheckLattice() {
    if (!reachZeroFrom && armState.length) reachApplyLimits();

    if ((reachZeroFrom === "arm") && reachMirroredCalibration()) {
        reachZeroFrom = "";
        reachApplyLimits();
    }

    reachBand = reachLimits();

    var band = reachBand.map(function (b) { return Math.round(b[0]) + ":" + Math.round(b[1]); }).join("/");
    var shape = reachGridMm + "|" + band;

    if (shape !== reachShape) {
        reachShape = shape;
        reachBuildLattice();
    }

    var plane = reachLock ? (reachLock + "|" + Math.round(reachLockAt * 1000) + "|" + band) : "";

    if (plane !== reachPlaneShape) {
        reachPlaneShape = plane;
        reachSlice = [];
        reachScreen = [];
        reachHover = -1;

        if (reachLock) reachBuildSlice();
    }
}

function reachBuildLattice() {
    reachLattice = [];
    reachScreen = [];
    reachHover = -1;
    reachBuild = null;

    if (reachGridMm <= 0) return;

    var step = reachGridMm / 1000;
    var z0 = Math.ceil(REACH_CLEARANCE / step);

    reachBuild = { step: step, z0: z0, zi: z0,
                   out: Math.ceil((REACH.upper + REACH.fore + REACH.tip + Math.abs(REACH.shoulderR)) / step),
                   up: Math.floor((REACH.plateZ + REACH.shoulderZ + REACH.upper + REACH.fore + REACH.tip) / step) };

    reachBuildSome();
}

function reachBuildSome() {
    var job = reachBuild;
    if (!job) return;

    var until = performance.now() + 12;

    while (performance.now() < until) {
        if (job.zi > job.up) {
            reachBuildRim(job.step);
            reachBuild = null;
            break;
        }

        for (var xi = -job.out; xi <= job.out; ++xi) {
            for (var yi = -job.out; yi <= job.out; ++yi) {
                var point = reachSpherePoint({ x: xi * job.step, y: yi * job.step, z: job.zi * job.step });
                if (point) reachLattice.push(point);
            }
        }

        ++job.zi;
    }

    reachPaint();
    reachPaintPanels();

    if (reachBuild === job) setTimeout(reachBuildSome, 0);
}

function reachBuildRim(step) {
    var reach = REACH.upper + REACH.fore + REACH.tip;
    var bz = REACH.plateZ + REACH.shoulderZ;
    var lo = reachBand[0][0] * Math.PI / 180, hi = reachBand[0][1] * Math.PI / 180;

    var tilt = (Math.PI / 2) / Math.round((Math.PI / 2) / (step / reach));

    for (var a = -Math.PI; a < Math.PI - 1e-9; a += tilt) {
        var r = REACH.shoulderR + (reach * Math.sin(a));
        var z = bz + (reach * Math.cos(a));

        if (z < REACH_CLEARANCE) continue;

        var turn = (Math.abs(r) < step) ? 100 : (step / Math.abs(r));
        var first = (turn === 100) ? 0 : Math.ceil(lo / turn);
        var last = (turn === 100) ? 0 : Math.floor(hi / turn);

        for (var k = first; k <= last; ++k) {
            var pan = k * turn;
            var point = { x: r * Math.cos(pan), y: r * Math.sin(pan), z: z };
            var room = reachRoom(point);

            if (room < 0) continue;

            point.margin = room;
            point.rim = true;
            reachLattice.push(point);
        }
    }
}

function reachSpherePoint(point) {
    var reach = REACH.upper + REACH.fore + REACH.tip;
    var r = Math.sqrt((point.x * point.x) + (point.y * point.y));
    var dz = point.z - (REACH.plateZ + REACH.shoulderZ);
    var inSphere = ((r * r) + (dz * dz)) <= (reach * reach) + 1e-9;

    var near = r - Math.abs(REACH.shoulderR);

    if (!inSphere && (((near * near) + (dz * dz)) > (reach * reach))) return null;

    var room = reachRoom(point);
    if ((room < 0) && !inSphere) return null;

    point.margin = room;
    return point;
}

function reachBuildSlice() {
    var step = REACH_SLICE_MM / 1000;
    var span = Math.ceil((REACH.upper + REACH.fore + REACH.tip) / step) * step;
    var top = REACH.plateZ + REACH.shoulderZ + REACH.upper + REACH.fore + REACH.tip + step;

    var free = (reachLock === "x") ? ["y", "z"] : ((reachLock === "y") ? ["x", "z"] : ["x", "y"]);
    var runs = { x: [-span, span], y: [-span, span], z: [REACH_CLEARANCE, top] };

    for (var a = runs[free[0]][0]; a <= runs[free[0]][1] + 1e-9; a += step) {
        for (var b = runs[free[1]][0]; b <= runs[free[1]][1] + 1e-9; b += step) {
            var point = { x: 0, y: 0, z: 0 };

            point[reachLock] = reachLockAt;
            point[free[0]] = a;
            point[free[1]] = b;

            if (reachSpherePoint(point)) reachSlice.push(point);
        }
    }
}

function reachSetLock(axis) {
    reachLock = (reachLock === axis) ? "" : axis;

    if (reachLock) {
        var live = reachLiveAngles();
        var tip = reachTarget || (live ? reachJoints(live[0], live[1], live[2], live[3])[4] : null);

        reachLockAt = tip ? tip[reachLock]
                          : ((reachLock === "z") ? (REACH.plateZ + REACH.shoulderZ) : 0);

        var step = REACH_SLICE_MM / 1000;
        if (!reachTarget) reachLockAt = Math.round(reachLockAt / step) * step;

    }

    var slider = document.getElementById("reach-lockat");
    if (slider) slider.value = Math.round(reachLockAt * 1000);

    reachCheckLattice();
    reachSolve2();
    reachPaint();
    reachPaintPanels();
}

function reachSetLockAt(mm) {
    reachLockAt = (parseFloat(mm) || 0) / 1000;
    reachCheckLattice();
    reachSolve2();
    reachPaint();
    reachPaintPanels();
}

function reachGripJoint() {
    var joint = armState[5];
    return (joint && joint.here && joint.cal) ? joint : null;
}

function reachGripServo(model) {
    var joint = reachGripJoint();
    if (!joint) return null;

    var servo = reachServoDegrees(5, model * Math.PI / 180);

    return Math.max((joint.mindeci / 10) + 1, Math.min((joint.maxdeci / 10) - 1, servo));
}

function reachGripShut() { return REACH_MECH[5][0] + 3; }
function reachGripHalf() { return (REACH_MECH[5][0] + REACH_MECH[5][1]) / 2; }

function reachGrabbed() {
    var joint = reachGripJoint();
    if (!joint || !reachZero || (reachZero[5] === undefined)) return false;

    var model = ((joint.deci / 10) - reachZero[5]) * ((reachSign[5] < 0) ? -1 : 1);

    return model < reachGripHalf();
}

function reachJaws(shut) {
    var want = reachGripServo(shut ? reachGripShut() : reachGripHalf());

    if (want === null) {
        reachNote("the gripper is not answering, or has no limits yet");
        return;
    }

    reachJawGoal = null;
    reachJawAsked = { deg: want, until: Date.now() + 1500 };
    armCommand("move/6/" + (Math.round(want * 10) / 10), "grip", true);
    reachPaint();
    reachNote(shut ? "grabbing" : "jaws half open");
}

const REACH_RATE_JAWS = 90;
var reachJawGoal = null;
const REACH_JAW_SHOW_MS = 700;
var reachJawAsked = null;

function reachJawOpen() {
    var joint = reachGripJoint();
    var way = reachJawShutWay();
    if (!joint || !way) return null;

    var lo = joint.mindeci / 10, hi = joint.maxdeci / 10;
    if (hi <= lo) return null;

    var deg = joint.deci / 10;

    if (reachJawAsked && (Date.now() < reachJawAsked.until)) deg = reachJawAsked.deg;

    var f = Math.max(0, Math.min(1, (deg - lo) / (hi - lo)));
    return (way > 0) ? (1 - f) : f;
}

function reachJawShutWay() {
    var shut = reachGripServo(reachGripShut());
    var half = reachGripServo(reachGripHalf());
    if ((shut === null) || (half === null) || (shut === half)) return 0;
    return (shut > half) ? 1 : -1;
}

function reachJawStart(shut) {
    var joint = reachGripJoint();
    var way = reachJawShutWay() * (shut ? 1 : -1);

    if (!joint || !way) {
        reachNote("the gripper is not answering, or has no limits yet");
        return;
    }

    if ((reachJawGoal === null) || (((reachJawGoal - joint.pos) * way) <= 0)) reachJawGoal = joint.pos;
}

function reachJawMove(shut, degrees) {
    var joint = reachGripJoint();
    var way = reachJawShutWay() * (shut ? 1 : -1);
    if (!joint || !way || (reachJawGoal === null)) return;

    var goal = reachJawGoal + (way * degrees * 4096 / 360);
    reachJawGoal = Math.max(joint.min, Math.min(joint.max, goal));

    reachJawAsked = { deg: (joint.deci + ((reachJawGoal - joint.pos) * 3600 / 4096)) / 10,
                      until: Date.now() + REACH_JAW_SHOW_MS };
    reachPaint();

    armHoldUntil[5] = Date.now() + ARM_HOLD_MS;

    var want = armWant(5);
    want.step = Math.round(reachJawGoal);
    want.jog = 0;

    armFlush();
}

function reachGrab(event) {
    if (!reachGripJoint()) {
        reachNote("the gripper is not answering, or has no limits yet");
        return;
    }

    if (event && event.shiftKey) {
        reachFlipJoint(5);
        reachNote("gripper direction flipped - F and G swap over with it");
        return;
    }

    reachJaws(!reachGrabbed());
}

const GRIP_STRENGTH_KEY = "robotarm.grip.strength";
const GRIP_STRENGTH_MIN = 10;
const GRIP_STRENGTH_STEP = 10;

var gripStrength = 100;

function gripSayStrength() {
    var slider = document.getElementById("reach-strength");
    var out = document.getElementById("reach-strengthval");

    if (slider) slider.value = gripStrength;
    if (out) out.textContent = gripStrength + "%";
}

function gripSendStrength() {
    armCommand("strength/6/" + gripStrength, "grip strength", true);
}

function gripSetStrength(percent) {
    var want = Math.max(GRIP_STRENGTH_MIN, Math.min(100, Math.round(Number(percent))));
    if (!isFinite(want)) return;

    gripStrength = want;

    try { localStorage.setItem(GRIP_STRENGTH_KEY, String(gripStrength)); }
    catch (e) {  }

    gripSayStrength();
    gripSendStrength();
    reachNote("grip at " + gripStrength + "% \u00b7 = harder, - softer");
}

function gripLoadStrength() {
    try {
        var saved = parseInt(localStorage.getItem(GRIP_STRENGTH_KEY), 10);

        if (isFinite(saved) && (saved >= GRIP_STRENGTH_MIN) && (saved <= 100)) {
            gripStrength = saved;
        }
    } catch (e) {  }

    gripSayStrength();
}

const GP_DEAD = 0.12;
const GP_TRIGGER_DEAD = 0.05;
const GP_CROSS = 0, GP_CIRCLE = 1, GP_SQUARE = 2, GP_TRIANGLE = 3, GP_L1 = 4, GP_R1 = 5, GP_L2 = 6, GP_R2 = 7;

var gpWasDown = {};
var gpDriving = false;

function gpPad() {
    if (!navigator.getGamepads) return null;

    var pads;
    try { pads = navigator.getGamepads(); } catch (e) { return null; }

    var any = null;

    for (var i = 0; i < pads.length; ++i) {
        var pad = pads[i];
        if (!pad || !pad.connected) continue;
        if (pad.mapping === "standard") return pad;
        if (!any) any = pad;
    }

    return any;
}

function gpAxis(pad, i) {
    var v = pad.axes[i] || 0;
    if (Math.abs(v) < GP_DEAD) return 0;
    return (v - ((v > 0) ? GP_DEAD : -GP_DEAD)) / (1 - GP_DEAD);
}

function gpButton(pad, i) {
    var b = pad.buttons[i];
    if (!b) return 0;
    var v = (typeof b === "object") ? (b.pressed ? Math.max(b.value, 0.5) : b.value) : b;
    return (v < GP_TRIGGER_DEAD) ? 0 : v;
}

function gpReach() {
    var pad = gpPad();
    if (!pad) { gpWasDown = {}; return null; }

    var down = {
        f: gpButton(pad, GP_CROSS) > 0.5,
        g: gpButton(pad, GP_CIRCLE) > 0.5,
        x: gpButton(pad, GP_SQUARE) > 0.5,
        c: gpButton(pad, GP_TRIANGLE) > 0.5,
        e: gpButton(pad, GP_L1) > 0.5,
        r: gpButton(pad, GP_R1) > 0.5,
    };

    if (down.f && !gpWasDown.f) reachJawStart(true);
    if (down.g && !gpWasDown.g) reachJawStart(false);
    gpWasDown = down;

    return {
        az: -gpAxis(pad, 2),
        el: -gpAxis(pad, 3),
        r: gpButton(pad, GP_R2) - gpButton(pad, GP_L2),
        f: down.f, g: down.g, x: down.x, c: down.c, tiltDown: down.e, tiltUp: down.r,
    };
}

function gpDrive() {
    if (driveDragging || Object.keys(driveHeld).length) { gpDriving = false; return; }

    var pad = gpPad();
    var x = pad ? -gpAxis(pad, 0) : 0;
    var y = pad ? gpAxis(pad, 1) : 0;

    if (!x && !y) {
        if (gpDriving) {
            gpDriving = false;
            driveCentre(true);
        }
        return;
    }

    gpDriving = true;

    var throwTo = driveKeyThrow();
    driveMoveStick(x * throwTo, y * throwTo);
}

function gpSay(text) {
    if (reachVisible()) reachNote(text);
}

window.addEventListener("gamepadconnected", function (event) {
    gpSay("gamepad: " + event.gamepad.id
          + ((event.gamepad.mapping === "standard") ? "" : " (not the standard layout - buttons may be off)"));
});

window.addEventListener("gamepaddisconnected", function () {
    gpWasDown = {};
    if (gpDriving) { gpDriving = false; driveCentre(true); }
    gpSay("gamepad gone");
});

const SLOT_JOINTS = "1234";

function slotOf(code) {
    if (code === "Backquote") return "key_tick";
    var digit = /^Digit([0-9])$/.exec(code || "");
    return digit ? ("key" + digit[1]) : null;
}

function slotLabel(slot) {
    return (slot === "key_tick") ? "`" : slot.slice(3);
}

function slotKey(slot, save) {
    if (save) {
        armCommand("pose/save/" + slot + "/" + SLOT_JOINTS, "Save to " + slotLabel(slot));
        reachNote("saved under " + slotLabel(slot));
    }
    else {
        armCommand("pose/load/" + slot + "/" + SLOT_JOINTS, "Go to " + slotLabel(slot));
        reachNote("going to " + slotLabel(slot));
        slotDriveFrom(slot);
    }
}

function reachSavedAngles(pose) {
    if (!pose || !reachZero || ((pose.joints & 0x0F) !== 0x0F)) return null;

    var q = [0, 0, 0, 0, 0];

    for (var j = 0; j < 4; ++j) {
        var deci = ((pose.pos[j] - 2048) * 3600) / 4096;
        var zero = (reachZero[j] !== undefined) ? reachZero[j] : 0;
        var sign = (reachSign[j] !== undefined) ? reachSign[j] : 1;

        q[j] = ((deci / 10) - zero) * sign * Math.PI / 180;
    }

    return q;
}

function slotDriveFrom(slot) {
    reachSph = null;

    var q = reachSavedAngles(poseNamed(slot));
    if (!q) return;

    var tip = reachJoints(q[0], q[1], q[2], q[3])[4];
    var at = { x: tip.x, y: tip.y, z: tip.z };

    reachSph = reachSphFrom(at, q[0]);
    reachSph.at = at;
    reachSph.solution = { ok: true, why: "", q: q, margin: 0, pitch: q[1] + q[2] + q[3] };

    reachAsked = at;
    reachTarget = at;
    reachSolution = reachSph.solution;
    reachShort = false;
    reachAnchor = { x: at.x, y: at.y, z: at.z };

    reachPaint();
    reachPaintPanels();
}

function reachPlaneStep(way) {
    if (!reachLock) return;

    reachSetLockAt(Math.round((reachLockAt * 1000) + (way * REACH_SLICE_MM)));

    var slider = document.getElementById("reach-lockat");
    if (slider) slider.value = Math.round(reachLockAt * 1000);
}

function reachCycleGrid() {
    var steps = reachGlOn() ? [15, 20, 30, 50, 100, 0] : [30, 50, 100, 0];
    var at = steps.indexOf(reachGridMm);

    reachGridMm = steps[(at + 1) % steps.length];
    reachGridChosen = true;
    reachCheckLattice();
    reachPaint();
    reachPaintPanels();
}

const REACH_PICK_PX = 9;

function reachNearest(px, py) {
    var best = -1;
    var near = Infinity;
    var front = -1;
    var frontDepth = Infinity;

    for (var i = 0; i < reachScreen.length; ++i) {
        var s = reachScreen[i];
        if (!s) continue;

        var d = ((s.x - px) * (s.x - px)) + ((s.y - py) * (s.y - py));

        if (d < near) { near = d; best = i; }
        if ((d <= REACH_PICK_PX * REACH_PICK_PX) && (s.d < frontDepth)) { frontDepth = s.d; front = i; }
    }

    return (front >= 0) ? front : best;
}

function reachNote(text) {
    var note = document.getElementById("reach-note");
    if (note) note.textContent = text;
}

function reachBasis() {
    var cp = Math.cos(reachCam.pitch), sp = Math.sin(reachCam.pitch);
    var cy = Math.cos(reachCam.yaw), sy = Math.sin(reachCam.yaw);

    var eye = {
        x: reachLook.x + (reachCam.dist * cp * cy),
        y: reachLook.y + (reachCam.dist * cp * sy),
        z: reachLook.z + (reachCam.dist * sp),
    };

    var f = { x: reachLook.x - eye.x, y: reachLook.y - eye.y, z: reachLook.z - eye.z };
    var fl = Math.sqrt((f.x * f.x) + (f.y * f.y) + (f.z * f.z));
    f.x /= fl; f.y /= fl; f.z /= fl;

    var r = { x: f.y, y: -f.x, z: 0 };
    var rl = Math.sqrt((r.x * r.x) + (r.y * r.y)) || 1;
    r.x /= rl; r.y /= rl;

    var u = {
        x: (r.y * f.z) - (r.z * f.y),
        y: (r.z * f.x) - (r.x * f.z),
        z: (r.x * f.y) - (r.y * f.x),
    };

    var width = (reachCanvasSize.w > 1) ? reachCanvasSize.w : 640;
    var height = (reachCanvasSize.h > 1) ? reachCanvasSize.h : 480;

    return { eye: eye, f: f, r: r, u: u, focal: Math.min(width, height * 1.25) * 0.95 };
}

function reachProject(b, p) {
    var v = { x: p.x - b.eye.x, y: p.y - b.eye.y, z: p.z - b.eye.z };
    var depth = (v.x * b.f.x) + (v.y * b.f.y) + (v.z * b.f.z);

    if (depth < 0.02) return null;

    return {
        x: (reachCanvasSize.w / 2) + ((((v.x * b.r.x) + (v.y * b.r.y) + (v.z * b.r.z)) * b.focal) / depth),
        y: (reachCanvasSize.h / 2) - ((((v.x * b.u.x) + (v.y * b.u.y) + (v.z * b.u.z)) * b.focal) / depth),
        d: depth,
    };
}

function reachUnprojectAxis(b, px, py, axis, value) {
    var sx = (px - (reachCanvasSize.w / 2)) / b.focal;
    var sy = -(py - (reachCanvasSize.h / 2)) / b.focal;

    var dir = [b.f.x + (b.r.x * sx) + (b.u.x * sy),
               b.f.y + (b.r.y * sx) + (b.u.y * sy),
               b.f.z + (b.r.z * sx) + (b.u.z * sy)];

    var eye = [b.eye.x, b.eye.y, b.eye.z];
    var k = (axis === "x") ? 0 : ((axis === "y") ? 1 : 2);

    if (Math.abs(dir[k]) < 1e-6) return null;

    var t = (value - eye[k]) / dir[k];
    if (t <= 0) return null;

    return { x: eye[0] + (dir[0] * t), y: eye[1] + (dir[1] * t), z: eye[2] + (dir[2] * t) };
}

function reachUnproject(b, px, py, height) {
    var sx = (px - (reachCanvasSize.w / 2)) / b.focal;
    var sy = -(py - (reachCanvasSize.h / 2)) / b.focal;

    var dir = {
        x: b.f.x + (b.r.x * sx) + (b.u.x * sy),
        y: b.f.y + (b.r.y * sx) + (b.u.y * sy),
        z: b.f.z + (b.r.z * sx) + (b.u.z * sy),
    };

    if (Math.abs(dir.z) < 1e-6) return null;

    var t = (height - b.eye.z) / dir.z;
    if (t <= 0) return null;

    return { x: b.eye.x + (dir.x * t), y: b.eye.y + (dir.y * t), z: height };
}

function reachJoints(q1, q2, q3, q4) {
    var a2 = q2, a3 = q2 + q3, a4 = q2 + q3 + q4;

    var pts = [];
    var r = REACH.shoulderR, z = REACH.plateZ + REACH.shoulderZ;

    pts.push({ r: REACH.shoulderR, z: REACH.plateZ });
    pts.push({ r: r, z: z });
    r += REACH.upper * Math.sin(a2); z += REACH.upper * Math.cos(a2);
    pts.push({ r: r, z: z });
    r += REACH.fore * Math.sin(a3); z += REACH.fore * Math.cos(a3);
    pts.push({ r: r, z: z });
    r += REACH.tip * Math.sin(a4); z += REACH.tip * Math.cos(a4);
    pts.push({ r: r, z: z });

    var cos = Math.cos(q1), sin = Math.sin(q1);

    return pts.map(function (p) {
        return { x: p.r * cos, y: p.r * sin, z: p.z };
    });
}

function reachSolve(target, pitch, elbowUp, back) {
    var q1 = Math.atan2(target.y, target.x);
    var r = Math.sqrt((target.x * target.x) + (target.y * target.y));

    if (back) { q1 += Math.PI; r = -r; }

    var wr = r - (REACH.tip * Math.sin(pitch));
    var wz = target.z - (REACH.tip * Math.cos(pitch));

    var dr = wr - REACH.shoulderR;
    var dz = wz - (REACH.plateZ + REACH.shoulderZ);
    var d = Math.sqrt((dr * dr) + (dz * dz));

    var reach = REACH.upper + REACH.fore;
    var inner = Math.abs(REACH.upper - REACH.fore);

    if ((d > reach + 1e-9) || (d < inner) || (d < 1e-9)) {
        return { ok: false, why: (d > reach) ? "too far" : "too close in", q: null };
    }

    var c = ((d * d) - (REACH.upper * REACH.upper) - (REACH.fore * REACH.fore))
          / (2 * REACH.upper * REACH.fore);
    c = Math.max(-1, Math.min(1, c));

    var e = Math.acos(c);
    var q3 = elbowUp ? e : -e;
    var psi = Math.atan2(dr, dz);
    var off = Math.atan2(REACH.fore * Math.sin(q3), REACH.upper + (REACH.fore * Math.cos(q3)));
    var q2 = psi - off;
    var q4 = pitch - q2 - q3;

    var q = [q1, q2, q3, q4, 0];
    var past = "";
    var margin = 1e9;

    for (var j = 0; j < 4; ++j) {
        var low = reachBand[j][0], high = reachBand[j][1];
        var deg = reachIntoBand(q[j] * 180 / Math.PI, low, high);

        q[j] = deg * Math.PI / 180;

        if ((deg < low) || (deg > high)) {
            past = ["pan", "lift", "elbow", "wrist"][j] + " wants "
                 + (Math.round(deg * 10) / 10) + "\u00B0 and can do "
                 + (Math.round(low * 10) / 10) + " to " + (Math.round(high * 10) / 10)
                 + "\u00B0";
        }

        margin = Math.min(margin, deg - low, high - deg);
    }

    if (past) return { ok: false, why: past, q: q, margin: 0 };

    var ze = (REACH.plateZ + REACH.shoulderZ) + (REACH.upper * Math.cos(q2));
    var zw = ze + (REACH.fore * Math.cos(q2 + q3));

    if ((ze < 0) || (zw < 0) || ((zw + (REACH.tip * Math.cos(pitch))) < 0)) {
        return { ok: false, why: "through the floor", q: q, margin: 0 };
    }

    return { ok: true, why: "", q: q, margin: margin, elbowUp: elbowUp };
}

function reachIntoBand(deg, low, high) {
    deg = ((((deg + 180) % 360) + 360) % 360) - 180;

    for (var k = -1; k <= 1; ++k) {
        var d = deg + (k * 360);
        if ((d >= low) && (d <= high)) return d;
    }

    return deg;
}

const REACH_PITCH_STEP = 5;

function reachEvery(target, each) {
    var r = Math.sqrt((target.x * target.x) + (target.y * target.y));
    var dz = target.z - (REACH.plateZ + REACH.shoulderZ);

    for (var w = 0; w < 2; ++w) {
        var straight = Math.atan2((w ? -r : r) - REACH.shoulderR, dz);

        for (var e = 0; e < 2; ++e) {
            var hit = reachSolve(target, straight, e === 0, w === 1);
            if (!hit.ok) continue;

            hit.pitch = straight;
            if (each(hit) === false) return;
        }
    }

    for (var deg = 0; deg < 360; deg += REACH_PITCH_STEP) {
        var pitch = deg * Math.PI / 180;

        for (var n = 0; n < 4; ++n) {
            var got = reachSolve(target, pitch, (n & 1) === 0, n >= 2);
            if (!got.ok) continue;

            got.pitch = pitch;
            if (each(got) === false) return;
        }
    }
}

function reachNowQ() {
    var live = reachLiveAngles();
    if (live) return live;

    return (reachSolution && reachSolution.q) ? reachSolution.q : [0, 0, 0, 0];
}

function reachClosest(target, near) {
    var best = null;

    reachEvery(target, function (got) {
        var away = 0;

        for (var j = 0; j < 4; ++j) {
            var dq = got.q[j] - near[j];
            away += dq * dq;
        }

        if (!best || (away < best.away)) { best = got; best.away = away; }
    });

    if (best) return best;

    var why = reachSolve(target, Math.PI, true, false);
    return { ok: false, why: why.why || "out of reach", q: why.q, margin: 0 };
}

function reachRoom(target) {
    var room = -1;

    reachEvery(target, function (got) {
        room = Math.max(room, got.margin);
        return room < REACH_EASY;
    });

    return room;
}

const REACH_MAX_JUMP = [25, 45, 45, 45].map(function (d) { return d * Math.PI / 180; });

function reachDegrees(radians) {
    return Math.round(radians * 1800 / Math.PI) / 10;
}

function reachStroke(ctx, b, a, c, width, colour) {
    var pa = reachProject(b, a), pb = reachProject(b, c);
    if (!pa || !pb) return;

    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
}

function reachDot(ctx, b, p, radius, colour) {
    var s = reachProject(b, p);
    if (!s) return;

    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
    ctx.fill();
}

const REACH_SKIN = {
    shell:   { rgb: [100, 116, 158],  emit: 0,    edge: "rgba(140,220,255,0.22)" },
    dark:    { rgb: [34, 38, 52],   emit: 0,    edge: "rgba(140,220,255,0.16)" },
    joint:   { rgb: [255, 150, 60], emit: 0.75, edge: "rgba(255,200,140,0.55)" },

    chassis: { rgb: [44, 50, 70],   emit: 0,    edge: "rgba(110,210,255,0.35)" },
    tread:   { rgb: [26, 28, 36],   emit: 0,    edge: "rgba(110,210,255,0.12)" },
    hub:     { rgb: [70, 200, 255], emit: 0.7,  edge: "rgba(160,235,255,0.6)" },
    lamp:    { rgb: [255, 90, 120], emit: 0.9,  edge: "rgba(255,160,180,0.7)" },
};

const REACH_LIGHT = (function () {
    var l = [0.35, 0.45, 0.82], n = Math.sqrt((l[0] * l[0]) + (l[1] * l[1]) + (l[2] * l[2]));
    return { x: l[0] / n, y: l[1] / n, z: l[2] / n };
})();

function reachAdd(a, c, k) { return { x: a.x + (c.x * k), y: a.y + (c.y * k), z: a.z + (c.z * k) }; }
function reachSub(a, c) { return { x: a.x - c.x, y: a.y - c.y, z: a.z - c.z }; }
function reachDotP(a, c) { return (a.x * c.x) + (a.y * c.y) + (a.z * c.z); }
function reachCross(a, c) {
    return { x: (a.y * c.z) - (a.z * c.y), y: (a.z * c.x) - (a.x * c.z), z: (a.x * c.y) - (a.y * c.x) };
}
function reachUnit(a) {
    var n = Math.sqrt(reachDotP(a, a)) || 1;
    return { x: a.x / n, y: a.y / n, z: a.z / n };
}

function reachPrism(out, a, c, ra, rc, sides, look, side, capLook) {
    var d = reachUnit(reachSub(c, a));
    var u = reachUnit(reachAdd(side, d, -reachDotP(side, d)));
    var v = reachCross(d, u);
    var ends = [[], []];

    for (var i = 0; i < sides; ++i) {
        var t = (Math.PI * 2 * (i + 0.5)) / sides;
        var dir = reachAdd(reachAdd({ x: 0, y: 0, z: 0 }, u, Math.cos(t)), v, Math.sin(t));

        ends[0].push(reachAdd(a, dir, ra));
        ends[1].push(reachAdd(c, dir, rc));
    }

    var centre = reachAdd(a, reachSub(c, a), 0.5);

    for (var k = 0; k < sides; ++k) {
        var n = (k + 1) % sides;
        out.push({ pts: [ends[0][k], ends[0][n], ends[1][n], ends[1][k]], look: look, centre: centre });
    }

    out.push({ pts: ends[0], look: capLook || look, centre: centre });
    out.push({ pts: ends[1], look: capLook || look, centre: centre });
}

function reachExtrude(out, profile, x0, x1, look) {
    var a = profile.map(function (p) { return { x: x0, y: p[0], z: p[1] }; });
    var c = profile.map(function (p) { return { x: x1, y: p[0], z: p[1] }; });
    var centre = { x: (x0 + x1) / 2, y: 0, z: 0 };

    for (var i = 0; i < profile.length; ++i) {
        centre.y += profile[i][0] / profile.length;
        centre.z += profile[i][1] / profile.length;
    }

    for (var k = 0; k < profile.length; ++k) {
        var n = (k + 1) % profile.length;
        out.push({ pts: [a[k], a[n], c[n], c[k]], look: look, centre: centre });
    }

    out.push({ pts: a, look: look, centre: centre });
    out.push({ pts: c, look: look, centre: centre });
}

function reachOnCar(p) {
    var a = REACH.mount * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return { x: (p.x * c) - (p.y * s), y: (p.x * s) + (p.y * c), z: p.z };
}

function reachBuildBase(out, parts) {
    var first = out.length;

    for (var i = 0; i < parts.length; ++i) {
        var part = parts[i];

        if (part.kind === "wheel") {
            var c = { x: part.at[0], y: part.at[1], z: part.at[2] };
            var half = part.width / 2;
            var across = { x: 0, y: 1, z: 0 };
            var outward = (part.at[1] < 0) ? -1 : 1;

            reachPrism(out, reachAdd(c, across, -half), reachAdd(c, across, half),
                       part.radius, part.radius, 12, REACH_SKIN.tread, { x: 1, y: 0, z: 0 });

            reachPrism(out, reachAdd(c, across, outward * half * 0.6),
                       reachAdd(c, across, outward * (half + 0.004)),
                       part.rim, part.rim * 0.8, 12, REACH_SKIN.dark, { x: 1, y: 0, z: 0 },
                       REACH_SKIN.hub);
            continue;
        }

        var hx = part.size[0] / 2, hy = part.size[1] / 2, hz = part.size[2] / 2;
        var bev = Math.min(hy, hz) * 0.45;
        var x = part.at[0], y = part.at[1], z = part.at[2];

        reachExtrude(out, [[y - hy, z - hz], [y + hy, z - hz], [y + hy, z + hz - bev],
                           [y + hy - bev, z + hz], [y - hy + bev, z + hz], [y - hy, z + hz - bev]],
                     x - hx, x + hx, REACH_SKIN.chassis);

        reachExtrude(out, [[y - hy * 0.6, z + hz * 0.05], [y + hy * 0.6, z + hz * 0.05],
                           [y + hy * 0.6, z + hz * 0.45], [y - hy * 0.6, z + hz * 0.45]],
                     x + hx, x + hx + 0.003, REACH_SKIN.lamp);
    }

    for (var f = first; f < out.length; ++f) {
        out[f].pts = out[f].pts.map(reachOnCar);
        out[f].centre = reachOnCar(out[f].centre);
    }
}

const REACH_LINK_R = 0.013;

function reachBuildArm(out, q, skin) {
    var p = reachJoints(q[0], q[1], q[2], q[3]);
    var side = { x: -Math.sin(q[0]), y: Math.cos(q[0]), z: 0 };
    var toward = { x: Math.cos(q[0]), y: Math.sin(q[0]), z: 0 };
    var top = REACH.plateZ + 0.030;

    reachPrism(out, { x: 0, y: 0, z: REACH.plateZ }, { x: 0, y: 0, z: top }, 0.044, 0.038, 6,
               skin.chassis, toward, skin.chassis);
    reachPrism(out, { x: 0, y: 0, z: REACH.plateZ + 0.008 }, { x: 0, y: 0, z: REACH.plateZ + 0.012 },
               0.0445, 0.0435, 6, skin.hub, toward);

    reachPrism(out, { x: p[0].x, y: p[0].y, z: top - 0.004 }, p[1], 0.017, 0.015, 6, skin.chassis, toward);

    reachLink(out, p[1], p[2], side, skin, skin.hub);
    reachLink(out, p[2], p[3], side, skin, skin.lamp);

    var live = reachLiveAngles();
    var roll = (q.length > 5) ? q[4] : (live ? live[4] : 0);

    reachBuildGripper(out, p[3], p[4], side, roll, reachJawOpen(), skin);

    reachServo(out, p[1], side, toward, 0.025, 0.023, skin);
    reachServo(out, p[2], side, toward, 0.022, 0.020, skin);
    reachServo(out, p[3], side, toward, 0.019, 0.017, skin);
}

function reachLink(out, a, c, side, skin, strip) {
    var d = reachUnit(reachSub(c, a));
    var up = reachUnit(reachCross(side, d));

    if (up.z < 0) up = { x: -up.x, y: -up.y, z: -up.z };

    reachPrism(out, a, c, REACH_LINK_R, REACH_LINK_R, 6, skin.chassis, side);

    var lift = REACH_LINK_R * 0.92;
    reachPrism(out, reachAdd(reachAdd(a, d, 0.024), up, lift), reachAdd(reachAdd(c, d, -0.022), up, lift),
               0.0028, 0.0028, 3, strip, side);
}

function reachServo(out, at, axis, toward, r, w, skin) {
    reachPrism(out, reachAdd(at, axis, -w), reachAdd(at, axis, w), r, r, 6, skin.tread, toward, skin.hub);
}

function reachBuildGripper(out, wrist, tip, side, roll, opened, skin) {
    var d = reachUnit(reachSub(tip, wrist));
    var u0 = reachUnit(reachAdd(side, d, -reachDotP(side, d)));
    var v0 = reachCross(d, u0);
    var u = reachAdd(reachAdd({ x: 0, y: 0, z: 0 }, u0, Math.cos(roll)), v0, Math.sin(roll));
    var v = reachCross(d, u);

    var swing = ((opened === null) ? 0.5 : opened) * 55 * Math.PI / 180;
    var c = Math.cos(swing), sn = Math.sin(swing);
    var front = 0.048;
    var hinge = { along: front - 0.004, across: 0.015 };

    var place = function (along, across, up, hinged) {
        if (hinged) {
            var a = along - hinge.along, b = across - hinge.across;
            along = hinge.along + (a * c) - (b * sn);
            across = hinge.across + (a * sn) + (b * c);
        }

        return reachAdd(reachAdd(reachAdd(wrist, d, along), u, across), v, up || 0);
    };

    reachPrism(out, place(0.002, 0), place(0.017, 0), 0.0155, 0.0155, 6, skin.tread, u, skin.tread);
    reachPrism(out, place(0.0085, 0), place(0.0115, 0), 0.0162, 0.0162, 6, skin.hub, u);

    var section = function (along, w, h, k, grow) {
        var g = grow || 1;
        w *= g; h *= g; k *= g;
        return [[-w + k, h], [w - k, h], [w, h - k], [w, -h + k], [w - k, -h], [-w + k, -h], [-w, -h + k], [-w, h - k]]
            .map(function (q) { return place(along, q[0] - 0.002, q[1]); });
    };

    reachLoft(out, [section(0.015, 0.017, 0.015, 0.006), section(0.031, 0.019, 0.016, 0.006),
                    section(front, 0.016, 0.012, 0.005)], skin.chassis, skin.chassis, skin.chassis);
    reachLoft(out, [section(0.026, 0.019, 0.016, 0.006, 1.06), section(0.030, 0.019, 0.016, 0.006, 1.06)],
              skin.hub, skin.hub, skin.hub);

    var stations = [[front - 0.006, 0.015, 0.0058, 0.0115], [front + 0.026, 0.0125, 0.0048, 0.0090],
                    [front + 0.052, 0.0060, 0.0034, 0.0055], [front + 0.062, 0.0030, 0.0012, 0.0016]];

    var blade = function (mirror) {
        var way = mirror ? 1 : -1;
        var rings = stations.map(function (st) {
            var t = st[2], h = st[3];
            return [[0, h], [t, h * 0.45], [t, -h * 0.45], [0, -h], [-t, -h * 0.45], [-t, h * 0.45]]
                .map(function (q) { return place(st[0], (way * st[1]) + q[0], q[1], mirror); });
        });

        reachLoft(out, rings, skin.tread, skin.tread, skin.lamp);

        for (var k = 0; k < stations.length - 1; ++k) {
            var a = stations[k], b = stations[k + 1];

            reachPrism(out, place(a[0], (way * a[1]) - (way * a[2]), 0, mirror),
                       place(b[0], (way * b[1]) - (way * b[2]), 0, mirror), 0.0012, 0.0012, 3, skin.lamp, v);
        }
    };

    blade(false);
    blade(true);

    reachServo(out, place(hinge.along, hinge.across, 0), v, d, 0.0075, 0.010, skin);
}

function reachLoft(out, rings, look, firstLook, lastLook) {
    var centre = { x: 0, y: 0, z: 0 }, count = 0;

    rings.forEach(function (ring) {
        ring.forEach(function (q) { centre = reachAdd(centre, q, 1); ++count; });
    });
    centre = { x: centre.x / count, y: centre.y / count, z: centre.z / count };

    for (var k = 0; k < rings.length - 1; ++k) {
        var a = rings[k], b = rings[k + 1], n = a.length;

        for (var i = 0; i < n; ++i) {
            var j = (i + 1) % n;
            out.push({ pts: [a[i], a[j], b[j], b[i]], look: look, centre: centre });
        }
    }

    out.push({ pts: rings[0].slice().reverse(), look: firstLook || look, centre: centre });
    out.push({ pts: rings[rings.length - 1], look: lastLook || look, centre: centre });
}

function reachDrawFaces(ctx, b, faces, holo) {
    var drawn = [];

    for (var i = 0; i < faces.length; ++i) {
        var face = faces[i];
        var pts = face.pts;
        var n = reachUnit(reachCross(reachSub(pts[1], pts[0]), reachSub(pts[2], pts[0])));
        var mid = { x: 0, y: 0, z: 0 };

        for (var k = 0; k < pts.length; ++k) mid = reachAdd(mid, pts[k], 1 / pts.length);

        if (reachDotP(n, reachSub(mid, face.centre)) < 0) n = { x: -n.x, y: -n.y, z: -n.z };

        var view = reachUnit(reachSub(mid, b.eye));
        var facing = -reachDotP(n, view);

        if (facing <= 0) continue;

        var screen = [];
        var depth = 0;

        for (var m = 0; m < pts.length; ++m) {
            var s = reachProject(b, pts[m]);
            if (!s) { screen = null; break; }
            screen.push(s);
            depth += s.d;
        }

        if (!screen) continue;

        drawn.push({ screen: screen, depth: depth / pts.length, look: face.look,
                     lit: Math.max(0, reachDotP(n, REACH_LIGHT)), rim: Math.pow(1 - facing, 3) });
    }

    drawn.sort(function (p, q) { return q.depth - p.depth; });

    for (var f = 0; f < drawn.length; ++f) {
        var d = drawn[f];
        var look = d.look;
        var shade = look.emit + ((1 - look.emit) * (0.30 + (0.70 * d.lit)));

        ctx.beginPath();
        ctx.moveTo(d.screen[0].x, d.screen[0].y);
        for (var e = 1; e < d.screen.length; ++e) ctx.lineTo(d.screen[e].x, d.screen[e].y);
        ctx.closePath();

        if (holo) {
            ctx.fillStyle = "rgba(" + holo + "," + (0.06 + (0.14 * d.lit)).toFixed(3) + ")";
            ctx.fill();
            ctx.strokeStyle = "rgba(" + holo + "," + (0.35 + (0.45 * d.rim)).toFixed(3) + ")";
            ctx.lineWidth = 1;
            ctx.stroke();
            continue;
        }

        var rgb = look.rgb.map(function (v, c) {
            return Math.min(255, Math.round((v * shade) + ([80, 200, 255][c] * 0.55 * d.rim)));
        });

        ctx.fillStyle = "rgb(" + rgb.join(",") + ")";
        ctx.fill();
        ctx.strokeStyle = look.edge;
        ctx.lineWidth = 0.75;
        ctx.stroke();
    }
}

function reachShowRenderer() {
    var badge = document.getElementById("reach-badge");
    if (!badge) return;

    var gl = !!reachScene;
    var text = gl ? ("WebGL2 \u00b7 " + ((reachGl.samples > 1) ? (reachGl.samples + "\u00d7 AA \u00b7 ") : "")
                     + (reachGl.bloom ? "bloom" : "no bloom"))
                  : "2D canvas";

    if (badge.textContent !== text) badge.textContent = text;

    badge.classList.toggle("reachbadgegl", gl);
    badge.title = gl ? "drawn on the graphics card - untick WebGL in the Points box for the 2D canvas"
                     : (reachGlBroken || (reachGlWanted ? "" : "WebGL is turned off in the Points box"));
}

var reachScene = null;

const REACH_ARRIVED = 2.5;

function reachArrived(q, live) {
    if (!q || !live) return false;

    for (var j = 0; j < 4; ++j) {
        var off = Math.abs(((((q[j] - live[j]) * 180 / Math.PI) + 540) % 360) - 180);
        if (off > REACH_ARRIVED) return false;
    }

    return true;
}

function reachSolids(ctx, b, faces, holo, alpha) {
    if (reachScene) {
        if (holo) reachScene.holos.push({ faces: faces, rgb: holo, alpha: (alpha === undefined) ? 1 : alpha });
        else reachScene.solids.push(faces);
        return;
    }

    ctx.save();
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    reachDrawFaces(ctx, b, faces, holo);
    ctx.restore();
}

function reachGlow(ctx, b, p, radius, rgb, strength) {
    var s = reachProject(b, p);
    if (!s) return;

    var r = Math.max(4, (radius * b.focal) / s.d);
    var g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);

    g.addColorStop(0, "rgba(" + rgb + "," + strength + ")");
    g.addColorStop(1, "rgba(" + rgb + ",0)");

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

var reachBaseCache = null;

function reachBaseParts() {
    if (reachBaseCache) return reachBaseCache;

    var parts = [{
        kind: "box",
        at: [REACH.carBack, 0, REACH.plateZ - (REACH.carH / 2)],
        size: [REACH.carL, REACH.carW, REACH.carH],
        what: "chassis plate",
    }];

    for (var front = -1; front <= 1; front += 2) {
        for (var left = -1; left <= 1; left += 2) {
            parts.push({
                kind: "wheel",
                at: [REACH.carBack + (front * REACH.wheelBase / 2),
                     left * REACH.wheelTrack / 2, REACH.wheelR],
                radius: REACH.wheelR,
                width: REACH.wheelW,
                rim: REACH.wheelRim,
                what: "wheel",
            });
        }
    }

    reachBaseCache = parts;
    return parts;
}

function reachDrawDome(ctx, b) {
    var reach = REACH.upper + REACH.fore + REACH.tip;
    var cz = REACH.plateZ + REACH.shoulderZ;
    var faint = "rgba(110,190,255,0.28)";
    var step = Math.PI / 36;

    var from = reachBand[0][0] * Math.PI / 180;
    var to = reachBand[0][1] * Math.PI / 180;

    var ring = function (z, radius, colour) {
        var last = null;

        ctx.strokeStyle = colour;
        ctx.lineWidth = 1;
        ctx.beginPath();

        for (var a = from; a <= to + 1e-9; a += step) {
            var p = reachProject(b, { x: radius * Math.cos(a), y: radius * Math.sin(a), z: z });

            if (!p) { last = null; continue; }
            if (!last) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);

            last = p;
        }

        ctx.stroke();
    };

    if (reachScene) { ring = function () {}; }

    ring(cz, reach, faint);

    if (reach > cz) {
        ring(0, Math.sqrt((reach * reach) - (cz * cz)), "rgba(110,190,255,0.22)");
    }

    for (var up = 30; up <= 60; up += 30) {
        var t = up * Math.PI / 180;
        ring(cz + (reach * Math.sin(t)), reach * Math.cos(t), "rgba(110,190,255,0.12)");
    }

    var edges = [reachBand[0][0], reachBand[0][1]];

    for (var turn = Math.ceil(reachBand[0][0] / 45) * 45; turn <= reachBand[0][1]; turn += 45) {
        edges.push(turn);
    }

    for (var m = 0; !reachScene && (m < edges.length); ++m) {
        var turn = edges[m];
        var edge = (m < 2);
        var c = Math.cos(turn * Math.PI / 180), sn = Math.sin(turn * Math.PI / 180);

        ctx.strokeStyle = edge ? "rgba(255,80,140,0.55)" : "rgba(110,190,255,0.12)";
        ctx.lineWidth = edge ? 1.5 : 1;
        ctx.beginPath();

        var moved = false;

        for (var e = 0; e <= 90; e += 5) {
            var r = reach * Math.cos(e * Math.PI / 180);
            var z = cz + (reach * Math.sin(e * Math.PI / 180));
            var p = reachProject(b, { x: r * c, y: r * sn, z: z });

            if (!p) { moved = false; continue; }
            if (!moved) { ctx.moveTo(p.x, p.y); moved = true; }
            else ctx.lineTo(p.x, p.y);
        }

        ctx.stroke();
    }

    var said = reachProject(b, { x: reach * 1.02 * Math.cos(to), y: reach * 1.02 * Math.sin(to),
                                 z: cz });

    if (said) {
        ctx.font = "11px ui-monospace, monospace";
        ctx.fillStyle = "rgba(255,110,160,0.9)";
        var text = "pan " + Math.round(reachBand[0][0]) + " to "
                 + Math.round(reachBand[0][1]) + "\u00B0";
        var wide = ctx.measureText(text).width;

        ctx.fillText(text, (said.x + 8 + wide < reachCanvasSize.w) ? (said.x + 8) : (said.x - 8 - wide),
                     said.y);
    }

    var marks = [["N", 1, 0], ["E", 0, -1], ["S", -1, 0], ["W", 0, 1]].map(function (m) {
        var turned = reachOnCar({ x: m[1], y: m[2], z: 0 });
        return [m[0], turned.x, turned.y];
    });

    ctx.font = "bold 12px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (var i = 0; i < marks.length; ++i) {
        var at = reachProject(b, { x: marks[i][1] * reach * 1.06,
                                   y: marks[i][2] * reach * 1.06, z: cz });

        if (!at) continue;

        ctx.fillStyle = "rgba(140,210,255,0.85)";
        ctx.fillText(marks[i][0], at.x, at.y);
    }

    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
}

function reachDrawPlane(ctx, b) {
    var span = REACH.upper + REACH.fore + REACH.tip;
    var top = REACH.plateZ + REACH.shoulderZ + span;
    var free = (reachLock === "x") ? ["y", "z"] : ((reachLock === "y") ? ["x", "z"] : ["x", "y"]);
    var runs = { x: [-span, span], y: [-span, span], z: [0, top] };
    var lo = [runs[free[0]][0], runs[free[1]][0]];
    var hi = [runs[free[0]][1], runs[free[1]][1]];

    var at = function (a, c) {
        var p = { x: 0, y: 0, z: 0 };
        p[reachLock] = reachLockAt;
        p[free[0]] = a;
        p[free[1]] = c;
        return p;
    };

    var corners = [at(lo[0], lo[1]), at(hi[0], lo[1]), at(hi[0], hi[1]), at(lo[0], hi[1])]
                      .map(function (p) { return reachProject(b, p); });

    if (corners.indexOf(null) < 0) {
        ctx.fillStyle = "rgba(40,170,100,0.10)";
        ctx.strokeStyle = "rgba(40,170,100,0.45)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);

        for (var k = 1; k < 4; ++k) ctx.lineTo(corners[k].x, corners[k].y);

        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    for (var i = 0; i < 2; ++i) {
        for (var v = Math.ceil(lo[i] / 0.05) * 0.05; v <= hi[i] + 1e-9; v += 0.05) {
            reachXyzLine(ctx, b, i ? at(lo[0], v) : at(v, lo[1]), i ? at(hi[0], v) : at(v, hi[1]),
                         0.35, 1);
        }
    }

    var label = reachProject(b, at(hi[0], hi[1]));

    if (label) {
        ctx.font = "bold 12px ui-monospace, monospace";
        ctx.fillStyle = "rgba(40,170,100,0.95)";
        ctx.fillText(reachLock + " = " + Math.round(reachLockAt * 1000) + "mm", label.x + 6, label.y);
    }
}

var reachOrder = [];
var reachPreview = null;

function reachDrawLattice(ctx, b, split) {
    var live = reachLive();

    reachScreen = [];
    reachOrder = [];

    if (reachLock && reachShowAll) {
        for (var k = 0; k < reachLattice.length; ++k) {
            var h = reachProject(b, reachLattice[k]);
            if (h && (reachLattice[k].margin >= 0)) reachOrder.push({ p: reachLattice[k], s: h, live: false });
        }
    }

    var torch = reachTorchNow;
    var lit = function (p) {
        if (reachShowAll) return 1;
        if (!torch) return 0;

        var d = Math.sqrt(reachDotP(reachSub(p, torch), reachSub(p, torch))) / REACH_TORCH_R;
        return (d >= 1) ? 0 : (1 - (d * d));
    };

    for (var i = 0; i < live.length; ++i) {
        var glow = lit(live[i]);
        var s = (glow > 0) ? reachProject(b, live[i]) : null;

        reachScreen.push(s);
        if (s) reachOrder.push({ p: live[i], s: s, live: true, lit: glow });
    }

    if (!reachShowAll && torch && !reachScene) reachDrawTorch(ctx, b, torch);

    reachOrder.sort(function (p, q) { return q.s.d - p.s.d; });

    reachOrder.near = Infinity;
    reachOrder.far = 0;

    for (var n = 0; n < reachOrder.length; ++n) {
        if (!reachOrder[n].live) continue;
        reachOrder.near = Math.min(reachOrder.near, reachOrder[n].s.d);
        reachOrder.far = Math.max(reachOrder.far, reachOrder[n].s.d);
    }

    reachDrawDots(ctx, b, function (d) { return d >= split; });
}

function reachDrawLatticeNear(ctx, b, split) {
    reachDrawDots(ctx, b, function (d) { return d < split; });

    if ((reachHover >= 0) && reachScreen[reachHover]) {
        var h = reachScreen[reachHover];
        var at = reachLive()[reachHover];
        var foot = { x: at.x, y: at.y, z: 0 };

        ctx.setLineDash([3, 3]);
        reachStroke(ctx, b, at, foot, 1, "rgba(120,255,200,0.55)");
        ctx.setLineDash([]);
        reachDot(ctx, b, foot, 2.5, "rgba(120,255,200,0.7)");
        reachGlow(ctx, b, at, 0.03, "120,255,200", 0.55);

        if ((at.margin >= 0) && (at !== reachTarget) && !reachDrag) {
            if (!reachPreview || (reachPreview.at !== at)) {
                reachPreview = { at: at, solution: reachClosest(at, reachNowQ()) };
            }

            if (reachPreview.solution.ok) {
                var shape = [];
                reachBuildArm(shape, reachPreview.solution.q, REACH_SKIN);
                reachSolids(ctx, b, shape, "120,255,200", 0.6);
            }
        }

        ctx.strokeStyle = (at.margin < 0) ? "rgba(255,90,110,0.95)" : "rgba(150,255,215,0.95)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(h.x, h.y, 8, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function reachDrawDots(ctx, b, which) {
    if (reachScene) return;

    ctx.fillStyle = "rgba(120,170,255,0.20)";

    for (var n = 0; n < reachOrder.length; ++n) {
        var o = reachOrder[n];
        if (o.live || !which(o.s.d)) continue;

        ctx.beginPath();
        ctx.arc(o.s.x, o.s.y, Math.max(0.8, 0.0022 * b.focal / o.s.d), 0, Math.PI * 2);
        ctx.fill();
    }

    var span = Math.max(1e-6, reachOrder.far - reachOrder.near);

    ctx.save();

    for (var m = 0; m < reachOrder.length; ++m) {
        var l = reachOrder[m];
        if (!l.live || !which(l.s.d)) continue;

        var p = l.p;

        if (p.margin < 0) {
            ctx.strokeStyle = "rgba(170,185,215," + (0.45 * l.lit).toFixed(3) + ")";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(l.s.x, l.s.y, Math.max(1.2, Math.min(3, 0.0022 * b.focal / l.s.d)), 0, Math.PI * 2);
            ctx.stroke();
            continue;
        }

        var room = Math.max(0, Math.min(1, (p.margin - REACH_TIGHT) / (REACH_EASY - REACH_TIGHT)));
        var hue = Math.round(38 + (122 * room));
        var back = reachLock ? 0 : ((l.s.d - reachOrder.near) / span);
        var radius = reachLock ? Math.max(2.2, Math.min(5.5, 0.0042 * b.focal / l.s.d))
                               : Math.max(1.1, Math.min(3.4, 0.0026 * b.focal / l.s.d)) * (1 - (0.45 * back));
        var alpha = (reachLock ? 1 : (0.85 - (0.7 * back))) * l.lit;

        radius *= 0.6 + (0.4 * l.lit);

        if ((back < 0.25) && (l.lit > 0.3)) {
            ctx.globalCompositeOperation = "lighter";
            ctx.fillStyle = "hsla(" + hue + ", 90%, 55%, " + (0.14 * (1 - (4 * back))).toFixed(3) + ")";
            ctx.beginPath();
            ctx.arc(l.s.x, l.s.y, radius * 2.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = "source-over";
        }

        ctx.fillStyle = "hsla(" + hue + ", 85%, 60%, " + alpha.toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(l.s.x, l.s.y, radius, 0, Math.PI * 2);
        ctx.fill();

        if ((back < 0.25) && (l.lit > 0.3)) {
            ctx.fillStyle = "rgba(255,255,255," + (0.5 * l.lit).toFixed(3) + ")";
            ctx.beginPath();
            ctx.arc(l.s.x - (radius * 0.3), l.s.y - (radius * 0.3), radius * 0.35, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    ctx.restore();
}

const REACH_FLY_SPEED = 0.35;
var reachFly = null;

function reachFlyLook(dx, dy) {
    var eye = reachBasis().eye;

    reachCam.yaw -= dx * 0.005;
    reachCam.pitch = Math.max(-1.4, Math.min(1.5, reachCam.pitch + (dy * 0.005)));

    var cp = Math.cos(reachCam.pitch), sp = Math.sin(reachCam.pitch);

    reachLook = { x: eye.x - (reachCam.dist * cp * Math.cos(reachCam.yaw)),
                  y: eye.y - (reachCam.dist * cp * Math.sin(reachCam.yaw)),
                  z: eye.z - (reachCam.dist * sp) };
}

function reachFlyStep(now) {
    if (!reachFly) return;

    var dt = Math.min(0.05, (now - (reachFly.at || now)) / 1000);
    var k = reachFly.keys;
    var b = reachBasis();
    var move = { x: 0, y: 0, z: 0 };

    reachFly.at = now;

    if (k.w) move = reachAdd(move, b.f, 1);
    if (k.s) move = reachAdd(move, b.f, -1);
    if (k.d) move = reachAdd(move, b.r, 1);
    if (k.a) move = reachAdd(move, b.r, -1);
    if (k.e) move.z += 1;
    if (k.q) move.z -= 1;

    if (move.x || move.y || move.z) {
        var speed = REACH_FLY_SPEED * (k.shift ? 3 : 1) * dt;

        reachLook = reachAdd(reachLook, reachUnit(move), speed);
        reachFly.flew = true;
        reachPaint();
    }

    requestAnimationFrame(reachFlyStep);
}

function reachXyzRgb(p) {
    var span = REACH.upper + REACH.fore + REACH.tip;
    var top = REACH.plateZ + REACH.shoulderZ + span;
    var n = function (v, lo, hi) { return Math.max(0, Math.min(1, (v - lo) / (hi - lo))); };

    return [n(p.x, -span, span), n(p.y, -span, span), n(p.z, 0, top)]
        .map(function (c) { return Math.round(70 + (185 * c)); }).join(",");
}

function reachXyzLine(ctx, b, a, c, alpha, width) {
    var pa = reachProject(b, a), pc = reachProject(b, c);
    if (!pa || !pc) return;

    var g = ctx.createLinearGradient(pa.x, pa.y, pc.x, pc.y);

    g.addColorStop(0, "rgba(" + reachXyzRgb(a) + "," + alpha + ")");
    g.addColorStop(1, "rgba(" + reachXyzRgb(c) + "," + alpha + ")");

    ctx.strokeStyle = g;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pc.x, pc.y);
    ctx.stroke();
}

function reachTorchPoint(b) {
    if (!reachMouse) return null;
    if (reachLock) return reachUnprojectAxis(b, reachMouse.x, reachMouse.y, reachLock, reachLockAt);

    var sx = (reachMouse.x - (reachCanvasSize.w / 2)) / b.focal;
    var sy = -(reachMouse.y - (reachCanvasSize.h / 2)) / b.focal;
    var dir = reachUnit(reachAdd(reachAdd(b.f, b.r, sx), b.u, sy));

    var hit = Infinity;
    var near = Math.max(0.02, (reachGridMm / 1000) * 0.6);

    for (var i = 0; i < reachLattice.length; ++i) {
        var p = reachLattice[i];
        if (p.margin < 0) continue;

        var v = reachSub(p, b.eye);
        var t = reachDotP(v, dir);

        if ((t <= 0) || (t >= hit)) continue;

        var off = reachSub(v, { x: dir.x * t, y: dir.y * t, z: dir.z * t });
        if (reachDotP(off, off) <= near * near) hit = t;
    }

    var from = isFinite(hit) ? hit : reachCam.dist;

    return reachAdd(b.eye, dir, Math.max(0.05, from + reachTorchIn));
}

function reachTorchBy(way) {
    reachTorchIn = Math.max(-0.5, Math.min(1.0, reachTorchIn + (way * REACH_TORCH_STEP)));
    reachTrack();
}

function reachDrawTorch(ctx, b, at) {
    var s = reachProject(b, at);
    if (!s) return;

    var r = Math.max(6, (REACH_TORCH_R * b.focal) / s.d);
    var g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
    var rgb = reachXyzRgb(at);

    g.addColorStop(0, "rgba(" + rgb + ",0.24)");
    g.addColorStop(0.75, "rgba(" + rgb + ",0.07)");
    g.addColorStop(1, "rgba(" + rgb + ",0)");

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = "rgba(" + rgb + ",0.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.stroke();
}

function reachDrawTorchGuides(ctx, b, at) {
    var reach = REACH.upper + REACH.fore + REACH.tip;
    var top = REACH.plateZ + REACH.shoulderZ + reach;
    var floor = { x: at.x, y: at.y, z: 0 };
    var height = Math.max(0, at.z);

    var c = reachProject(b, floor);
    var size = REACH_TORCH_R * (0.7 + (1.2 * height / top));
    var ex = reachProject(b, { x: at.x + size, y: at.y, z: 0 });
    var ey = reachProject(b, { x: at.x, y: at.y + size, z: 0 });

    if (c && ex && ey && !reachScene) {
        var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        var strength = 0.55 * (1 - (0.6 * height / top));

        g.addColorStop(0, "rgba(" + reachXyzRgb(floor) + "," + strength.toFixed(3) + ")");
        g.addColorStop(0.55, "rgba(" + reachXyzRgb(floor) + "," + (strength * 0.35).toFixed(3) + ")");
        g.addColorStop(1, "rgba(" + reachXyzRgb(floor) + ",0)");

        ctx.save();
        ctx.transform(ex.x - c.x, ex.y - c.y, ey.x - c.x, ey.y - c.y, c.x, c.y);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    var axes = [
        ["255,110,110", { x: -REACH_WALL, y: at.y, z: at.z }, { x: REACH_WALL, y: at.y, z: at.z }],
        ["120,240,140", { x: at.x, y: -REACH_WALL, z: at.z }, { x: at.x, y: REACH_WALL, z: at.z }],
        ["110,170,255", floor, { x: at.x, y: at.y, z: Math.max(top, REACH_WALL_H) }],
    ];

    for (var i = 0; i < axes.length; ++i) {
        for (var end = 1; end <= 2; ++end) {
            var pa = reachProject(b, at), pb = reachProject(b, axes[i][end]);
            if (!pa || !pb) continue;

            var line = ctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y);

            line.addColorStop(0, "rgba(" + axes[i][0] + ",0.75)");
            line.addColorStop(1, "rgba(" + axes[i][0] + ",0.04)");

            ctx.strokeStyle = line;
            ctx.lineWidth = 1.25;
            ctx.beginPath();
            ctx.moveTo(pa.x, pa.y);
            ctx.lineTo(pb.x, pb.y);
            ctx.stroke();
        }

        var step = Math.max(0.01, reachGridMm / 1000);
        var k = ["x", "y", "z"][i];

        for (var n = -4; n <= 4; ++n) {
            if (!n) continue;

            var tick = { x: at.x, y: at.y, z: at.z };
            tick[k] += n * step;

            if (tick.z < 0) continue;

            reachDot(ctx, b, tick, 1.6, "rgba(" + axes[i][0] + "," + (0.7 - (0.12 * Math.abs(n))).toFixed(3) + ")");
        }
    }

    reachDot(ctx, b, floor, 2.5, "rgba(" + reachXyzRgb(floor) + ",0.9)");
}

function reachDrawCursor(ctx, b) {
    if (!reachMouse || reachDrag) return;

    var dot = ((reachHover >= 0) && reachScreen[reachHover]) ? reachLive()[reachHover] : null;
    var at = dot || reachTorchNow;

    if (!at) return;

    var where = dot ? ((dot.margin < 0) ? "out of reach" : "")
              : (reachLock ? "on the plane"
                           : ("torch" + ((Math.abs(reachTorchIn) < 0.001) ? ""
                                         : (", " + Math.abs(Math.round(reachTorchIn * 1000)) + "mm "
                                            + ((reachTorchIn > 0) ? "in" : "out")))));
    var parts = [["x", at.x, "255,110,110"], ["y", at.y, "120,240,140"], ["z", at.z, "110,170,255"]];
    var x = reachMouse.x + 18, y = reachMouse.y + 26;

    ctx.font = "600 11px ui-monospace, monospace";

    var widths = parts.map(function (p) { return ctx.measureText(p[0] + " " + Math.round(p[1] * 1000)).width; });
    var note = where ? ctx.measureText(where).width + 10 : 0;
    var w = widths.reduce(function (a, c) { return a + c + 12; }, 6) + note;

    x = Math.min(x, reachCanvasSize.w - w - 4);
    if (y > reachCanvasSize.h - 90) y = reachMouse.y - 22;

    ctx.fillStyle = "rgba(8,12,24,0.82)";
    ctx.strokeStyle = "rgba(120,200,255,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y - 13, w, 20, 10);
    else ctx.rect(x, y - 13, w, 20);
    ctx.fill();
    ctx.stroke();

    var cx = x + 9;

    for (var i = 0; i < parts.length; ++i) {
        ctx.fillStyle = "rgba(" + parts[i][2] + ",1)";
        ctx.fillText(parts[i][0] + " " + Math.round(parts[i][1] * 1000), cx, y + 1);
        cx += widths[i] + 12;
    }

    if (where) {
        ctx.fillStyle = (where === "out of reach") ? "rgba(255,110,130,0.95)" : "rgba(170,185,215,0.8)";
        ctx.fillText(where, cx, y + 1);
    }
}

function reachSetShowAll(on) {
    reachShowAll = !!on;

    try { localStorage.setItem(REACH_SHOWALL_KEY, reachShowAll ? "1" : "0"); } catch (e) {}

    reachPaint();
}

var reachPaintQueued = false;

function reachTrack() {
    if (reachPaintQueued) return;

    reachPaintQueued = true;

    requestAnimationFrame(function () {
        reachPaintQueued = false;
        reachPaint();

        if (!reachMouse || reachDrag) return;

        var was = reachHover;

        reachHover = reachNearest(reachMouse.x, reachMouse.y);

        if (reachHover !== was) reachPaint();
    });
}

function reachTag(ctx, x, y, text, rgb) {
    ctx.font = "600 11px ui-monospace, monospace";

    var w = ctx.measureText(text).width + 12;

    x = Math.min(x, reachCanvasSize.w - w - 4);

    ctx.fillStyle = "rgba(8,12,24,0.78)";
    ctx.strokeStyle = "rgba(" + rgb + ",0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y - 12, w, 18, 9);
    else ctx.rect(x, y - 12, w, 18);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(" + rgb + ",1)";
    ctx.fillText(text, x + 6, y + 1);
}

function reachDrawRoom(ctx, b, w, h) {
    var sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#0b1022");
    sky.addColorStop(1, "#141a30");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    var centre = reachProject(b, { x: 0, y: 0, z: 0 });

    if (centre) {
        var far = reachProject(b, { x: 0.45, y: 0, z: 0 });
        var r = far ? Math.max(80, Math.hypot(far.x - centre.x, far.y - centre.y) * 1.4) : 300;
        var pool = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, r);

        pool.addColorStop(0, "rgba(60,140,255,0.22)");
        pool.addColorStop(1, "rgba(60,140,255,0)");
        ctx.fillStyle = pool;
        ctx.fillRect(0, 0, w, h);
    }

    var fade = function (x, y) {
        return Math.max(0, 1 - (Math.sqrt((x * x) + (y * y)) / 0.6));
    };

    for (var g = -12; g <= 12; ++g) {
        var t = g * 0.05;

        for (var k = -12; k < 12; ++k) {
            var u = k * 0.05;

            var a1 = fade(t, u + 0.025);
            if (a1 > 0) reachStroke(ctx, b, { x: t, y: u, z: 0 }, { x: t, y: u + 0.05, z: 0 }, 1,
                                    "rgba(" + reachXyzRgb({ x: t, y: u + 0.025, z: 0 }) + ","
                                    + (0.42 * a1).toFixed(3) + ")");

            var a2 = fade(u + 0.025, t);
            if (a2 > 0) reachStroke(ctx, b, { x: u, y: t, z: 0 }, { x: u + 0.05, y: t, z: 0 }, 1,
                                    "rgba(" + reachXyzRgb({ x: u + 0.025, y: t, z: 0 }) + ","
                                    + (0.42 * a2).toFixed(3) + ")");
        }
    }

    reachStroke(ctx, b, { x: 0.12, y: 0, z: 0 }, { x: 0.30, y: 0, z: 0 }, 2, "rgba(120,220,255,0.55)");
    reachStroke(ctx, b, { x: 0.30, y: 0, z: 0 }, { x: 0.27, y: 0.015, z: 0 }, 2, "rgba(120,220,255,0.55)");
    reachStroke(ctx, b, { x: 0.30, y: 0, z: 0 }, { x: 0.27, y: -0.015, z: 0 }, 2, "rgba(120,220,255,0.55)");

    var middle = reachOnCar({ x: REACH.carBack, y: 0, z: 0 });
    var under = reachProject(b, middle);

    if (under) {
        var edge = reachProject(b, reachOnCar({ x: REACH.carBack + REACH.carL * 0.8, y: 0, z: 0 }));
        var rr = edge ? Math.max(20, Math.hypot(edge.x - under.x, edge.y - under.y)) : 60;
        var shade = ctx.createRadialGradient(under.x, under.y, 0, under.x, under.y, rr);

        shade.addColorStop(0, "rgba(0,0,0,0.55)");
        shade.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = shade;
        ctx.beginPath();
        ctx.ellipse(under.x, under.y, rr, rr * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

function reachPaint() {
    var canvas = document.getElementById("reachview");
    if (!canvas) return;

    var ratio = window.devicePixelRatio || 1;
    var box = canvas.getBoundingClientRect();

    if ((box.width < 1) || (box.height < 1)) return;

    if ((canvas.width !== Math.round(box.width * ratio)) || (canvas.height !== Math.round(box.height * ratio))) {
        canvas.width = Math.round(box.width * ratio);
        canvas.height = Math.round(box.height * ratio);
    }

    reachCanvasSize = { w: box.width, h: box.height };

    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    var b = reachBasis();

    reachScene = reachGlOn() ? { solids: [], holos: [], torch: null, near: 0, far: 1 } : null;

    if (reachScene) ctx.clearRect(0, 0, box.width, box.height);
    else {
        reachGlClear();
        reachDrawRoom(ctx, b, box.width, box.height);
    }

    reachDrawDome(ctx, b);

    if (reachLock) reachDrawPlane(ctx, b);

    var shoulder = reachProject(b, { x: 0, y: 0, z: REACH.plateZ + REACH.shoulderZ });
    var split = shoulder ? shoulder.d : 1;

    reachTorchNow = reachTorchPoint(b);
    if (reachTorchNow) reachDrawTorchGuides(ctx, b, reachTorchNow);

    reachDrawLattice(ctx, b, split);

    var live = reachLiveAngles();
    var solids = [];

    var wheels = reachBaseParts();

    reachBuildBase(solids, wheels);
    if (live) reachBuildArm(solids, live, REACH_SKIN);

    reachSolids(ctx, b, solids);

    var bloom = reachScene && reachGl && reachGl.bloom;

    for (var w = 0; !bloom && (w < wheels.length); ++w) {
        if (wheels[w].kind !== "wheel") continue;

        reachGlow(ctx, b, { x: wheels[w].at[0], y: wheels[w].at[1] + ((wheels[w].at[1] < 0) ? -1 : 1)
                                                                    * wheels[w].width * 0.6,
                            z: wheels[w].at[2] }, 0.03, "70,200,255", 0.35);
    }

    if (live) {
        var pivots = reachJoints(live[0], live[1], live[2], live[3]);

        for (var g = 1; !bloom && (g <= 3); ++g) reachGlow(ctx, b, pivots[g], 0.035, "255,150,60", 0.35);
    }

    reachDrawLatticeNear(ctx, b, split);

    if (reachShowPose >= 0) {
        var want = REACH_POSES[reachShowPose].q;

        var rad = [want[0] * Math.PI / 180, want[1] * Math.PI / 180,
                   want[2] * Math.PI / 180, want[3] * Math.PI / 180];

        var held = [];
        reachBuildArm(held, rad, REACH_SKIN);
        reachSolids(ctx, b, held, "90,170,255");
    }

    var saved = poseShown ? reachSavedAngles(poseNamed(poseShown)) : null;

    if (saved) {
        var there = [];
        reachBuildArm(there, saved, REACH_SKIN);
        reachSolids(ctx, b, there, "255,190,70");
    }

    if (reachTarget && (reachShowPose < 0) && !saved) {
        if (reachSolution && reachSolution.q) {
            if (!reachSolution.ok || !reachArrived(reachSolution.q, live)) {
                var ghost = [];
                reachBuildArm(ghost, reachSolution.q, REACH_SKIN);
                reachSolids(ctx, b, ghost, reachSolution.ok ? "255,190,70" : "255,70,90");
            }
        }

        if (reachShort && reachAsked) {
            var asked = reachProject(b, reachAsked);
            var landed = reachProject(b, reachTarget);

            if (asked && landed) {
                ctx.strokeStyle = "rgba(255,70,90,0.65)";
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 3]);
                ctx.beginPath();
                ctx.moveTo(landed.x, landed.y);
                ctx.lineTo(asked.x, asked.y);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.beginPath();
                ctx.moveTo(asked.x - 5, asked.y - 5);
                ctx.lineTo(asked.x + 5, asked.y + 5);
                ctx.moveTo(asked.x + 5, asked.y - 5);
                ctx.lineTo(asked.x - 5, asked.y + 5);
                ctx.stroke();
            }
        }

        var ground = { x: reachTarget.x, y: reachTarget.y, z: 0 };
        ctx.setLineDash([3, 3]);
        reachStroke(ctx, b, ground, reachTarget, 1, "rgba(255,200,90,0.55)");
        ctx.setLineDash([]);
        reachDot(ctx, b, ground, 3, "rgba(255,200,90,0.6)");

        var ok = reachSolution && reachSolution.ok;
        var colour = ok ? "rgba(255,200,90,1)" : "rgba(255,70,90,1)";

        reachGlow(ctx, b, reachTarget, 0.035, ok ? "255,190,70" : "255,70,90", 0.5);
        var s = reachProject(b, reachTarget);

        if (s) {
            ctx.strokeStyle = colour;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
            ctx.moveTo(s.x - 13, s.y); ctx.lineTo(s.x + 13, s.y);
            ctx.moveTo(s.x, s.y - 13); ctx.lineTo(s.x, s.y + 13);
            ctx.stroke();
        }
    }

    reachDrawCursor(ctx, b);

    reachShowRenderer();

    if (reachScene) {
        reachScene.torch = reachTorchNow;
        reachScene.near = isFinite(reachOrder.near) ? reachOrder.near : 0;
        reachScene.far = reachOrder.far || 1;
        reachGlDraw(b, reachScene);
    }
}

function reachLiveAngles() {
    if (!armState.length || !reachZero) return null;

    var q = [0, 0, 0, 0, 0, 0];

    for (var j = 0; j < REACH_JOINTS; ++j) {
        var joint = armState[j];

        if (!joint || !joint.here) {
            if (j < 4) return null;
            continue;
        }

        var zero = (reachZero && (reachZero[j] !== undefined)) ? reachZero[j] : 0;
        var sign = (reachSign[j] !== undefined) ? reachSign[j] : 1;

        q[j] = ((joint.deci / 10) - zero) * sign * Math.PI / 180;
    }

    return q;
}

function reachServoDegrees(j, radians) {
    var zero = reachZero ? reachZero[j] : 0;
    return (radians * 180 / Math.PI * reachSign[j]) + zero;
}

const REACH_ONE = [
    { name: "Turned right, level, gripper down", q: [-90, 90, 0, 90],
      how: "turn a quarter RIGHT \u00B7 upper arm level \u00B7 forearm level \u00B7 gripper hanging DOWN" },
    { name: "Straight forward, level", q: [0, 90, 0, 0],
      how: "turn forward \u00B7 everything level, pointing away" },
];

var reachOneWhich = 0;

function reachCalibrateForward(which) {
    reachOneWhich = which || 0;
    reachOneShot = true;
    reachNote("reading the servos - hold it as " + REACH_ONE[reachOneWhich].name + "...");

    if (!armCommand("state", "state", true)) {
        reachOneShot = false;
        reachNote("no link to the arm");
        return;
    }

    setTimeout(function () {
        if (!reachOneShot) return;

        reachOneShot = false;
        reachNote("the arm did not answer, so nothing was calibrated");
    }, 1500);
}

function reachTakeForward() {
    reachOneShot = false;

    var pose = REACH_ONE[reachOneWhich].q;
    var zero = [];
    var sign = [];
    var guessed = [];
    var names = ["pan", "lift", "elbow", "wrist"];
    var unsure = [];

    for (var j = 0; j < 4; ++j) {
        var joint = armState[j];

        if (!joint || !joint.here || !joint.cal) {
            reachNote(names[j] + " has no limits yet (Calibration menu), so this cannot be worked out");
            return;
        }

        var servo = joint.deci / 10;
        var low = joint.mindeci / 10;
        var high = joint.maxdeci / 10;
        var mech = REACH_MECH[j];
        var score = {};
        var zeros = {};

        for (var way = -1; way <= 1; way += 2) {
            var z = (way > 0) ? (servo - pose[j]) : (servo + pose[j]);
            var a = (low - z) * way;
            var b = (high - z) * way;

            score[way] = Math.abs(Math.min(a, b) - mech[0]) + Math.abs(Math.max(a, b) - mech[1]);
            zeros[way] = z;
        }

        var pick = (score[1] < score[-1]) ? 1 : -1;
        var close = Math.abs(score[1] - score[-1]) <= 8;

        if (close) {
            pick = reachSignChoice[j];
            unsure.push(names[j]);
        }

        reachSignChoice[j] = pick;
        sign.push(pick);
        zero.push(zeros[pick]);
        guessed.push(close);
    }

    for (var k = 4; k < REACH_JOINTS; ++k) {
        var extra = armState[k];
        var mech = REACH_MECH[k];

        if (extra && extra.here && extra.cal) {
            var low = extra.mindeci / 10;
            zero.push((reachSignChoice[k] > 0) ? (low - mech[0]) : (low + mech[1]));
            sign.push(reachSignChoice[k]);
        }
        else { zero.push(0); sign.push(1); }

        guessed.push(mech[0] + mech[1] === 0);
    }

    reachZero = zero;
    reachSign = sign;
    reachScale = [1, 1, 1, 1];
    reachGuessed = guessed;
    reachForwardRead = [armState[0].deci / 10, armState[1].deci / 10,
                        armState[2].deci / 10, armState[3].deci / 10];
    reachTrouble = [];
    reachZeroFrom = "forward";
    reachOnArm = false;
    reachSendCalibration();

    try {
        localStorage.setItem(REACH_SIGN_KEY, JSON.stringify(reachSignChoice));
        localStorage.setItem(REACH_KEY, JSON.stringify({ zero: reachZero, sign: reachSign,
                                                         scale: reachScale, poses: reachCaptured,
                                                         from: "forward", forward: reachForwardRead,
                                                         which: reachOneWhich }));
    }
    catch (e) {}

    reachNote(unsure.length
        ? ("calibrated. " + unsure.join(" and ") + " could be either way round - if the purple arm "
           + "is mirrored there, flip it")
        : "calibrated from one pose, every joint settled");

    reachCheckLattice();
    reachSolve2();
    reachPaint();
    reachPaintPanels();
}

function reachApplyLimits() {
    if (armState.length < 4) return false;

    var zero = [];
    var sign = [];

    for (var j = 0; j < REACH_JOINTS; ++j) {
        var joint = armState[j];

        if (!joint || !joint.here || !joint.cal) {
            if (j < 4) return false;
            zero.push(0);
            sign.push(1);
            continue;
        }

        var low = joint.mindeci / 10;
        var mech = REACH_MECH[j];

        if (reachSignChoice[j] > 0) { sign.push(1); zero.push(low - mech[0]); }
        else { sign.push(-1); zero.push(low + mech[1]); }
    }

    reachZero = zero;
    reachSign = sign;
    reachScale = [1, 1, 1, 1];
    reachTrouble = [];
    reachZeroFrom = "limits";

    reachSendCalibration();
    return true;
}

function reachFlipJoint(j) {
    reachSignChoice[j] = -reachSignChoice[j];

    try { localStorage.setItem(REACH_SIGN_KEY, JSON.stringify(reachSignChoice)); } catch (e) {}

    if ((reachZeroFrom === "forward") && (j < 4)) {
        if (reachForwardRead) {
            var pose = REACH_ONE[reachOneWhich].q;
            reachZero[j] = (reachSignChoice[j] > 0) ? (reachForwardRead[j] - pose[j])
                                                   : (reachForwardRead[j] + pose[j]);
            reachSign[j] = reachSignChoice[j];
        }
    }
    else if (j >= 4) {
        var joint = armState[j];
        var mech = REACH_MECH[j];

        if (joint && joint.here && joint.cal && reachZero) {
            var low = joint.mindeci / 10;
            reachZero[j] = (reachSignChoice[j] > 0) ? (low - mech[0]) : (low + mech[1]);
            reachSign[j] = reachSignChoice[j];
        }
    }
    else if (reachZeroFrom !== "poses") {
        reachApplyLimits();
    }

    reachSendCalibration();

    reachCheckLattice();
    reachSolve2();
    reachPaint();
    reachPaintPanels();
}

function reachDeriveMapping() {
    var zero = [0, 0, 0, 0];
    var sign = [1, 1, 1, 1];
    var scale = [0, 0, 0, 0];
    var solved = 0;

    reachTrouble = [];

    for (var j = 0; j < 4; ++j) {
        var name = ["pan", "lift", "elbow", "wrist"][j];
        var best = null;

        for (var a = 0; a < REACH_POSES.length; ++a) {
            for (var b = a + 1; b < REACH_POSES.length; ++b) {
                var ca = reachCaptured[REACH_POSES[a].name];
                var cb = reachCaptured[REACH_POSES[b].name];

                if (!ca || !cb) continue;

                var dm = REACH_POSES[b].q[j] - REACH_POSES[a].q[j];
                if (Math.abs(dm) < 1) continue;

                if (!best || (Math.abs(dm) > Math.abs(best.dm))) {
                    best = { dm: dm, ds: cb[j] - ca[j], ref: ca[j], refq: REACH_POSES[a].q[j],
                             from: REACH_POSES[a].name, to: REACH_POSES[b].name };
                }
            }
        }

        if (!best) continue;

        var ratio = best.ds / best.dm;

        scale[j] = Math.abs(ratio);

        if (Math.abs(scale[j] - 1) > 0.25) {
            reachTrouble.push(name + ": " + (
                (Math.abs(best.ds) < 2)
                    ? ("it read the same in \"" + best.from + "\" and \"" + best.to
                       + "\", so the arm was not moved between them")
                    : ("the servo moved " + (Math.round(best.ds * 10) / 10) + "\u00B0 where the pose asks for "
                       + (Math.round(best.dm * 10) / 10) + "\u00B0, so it was not in that pose")));
            continue;
        }

        sign[j] = (ratio < 0) ? -1 : 1;
        zero[j] = best.ref - (best.refq * sign[j]);
        ++solved;
    }

    if (solved < 4) {
        reachScale = scale;
        reachZeroFrom = "";
        reachApplyLimits();
        return solved;
    }

    reachZero = zero;
    reachSign = [sign[0], sign[1], sign[2], sign[3], 1];
    reachScale = scale;
    reachZeroFrom = "poses";
    reachOnArm = false;
    reachSave();
    reachSendCalibration();

    return solved;
}

var reachSentCal = "";

function reachCalScale(j) {
    var scale = (reachScale && (j < reachScale.length)) ? reachScale[j] : 0;

    if (!scale || !isFinite(scale)) return 1000;

    return Math.max(500, Math.min(2000, Math.round(scale * 1000)));
}

function reachCalSignature() {
    var parts = [];

    for (var j = 0; j < REACH_JOINTS; ++j) {
        parts.push(Math.round(((reachZero[j] === undefined) ? 0 : reachZero[j]) * 10));
        parts.push((reachSign[j] < 0) ? -1 : 1);
        parts.push(reachCalScale(j));
    }

    return parts.join(",");
}

function reachSendCalibration() {
    if (!reachZero) return;

    var now = reachCalSignature();

    if (now === reachSentCal) return;

    reachSentCal = now;

    for (var j = 0; j < REACH_JOINTS; ++j) {
        var zero = (reachZero[j] === undefined) ? 0 : reachZero[j];
        var dir = (reachSign[j] < 0) ? -1 : 1;

        armCommand("calib/set/" + (j + 1) + "/" + (Math.round(zero * 10) / 10) + "/" + dir
                   + "/" + reachCalScale(j), "calib", true);
    }

    armCommand("calib/save", "calib");
}

function reachTakeCalibration(said) {
    if (!said || !said.joints || !said.joints.length) return;

    var zero = [];
    var sign = [];
    var scale = [];

    for (var j = 0; j < said.joints.length; ++j) {
        zero.push(said.joints[j].zero / 10);
        sign.push((said.joints[j].dir < 0) ? -1 : 1);
        scale.push(said.joints[j].scale ? (said.joints[j].scale / 1000) : 1);
    }

    if (!said.known) {
        reachOnArm = false;
        return;
    }

    reachZero = zero;
    reachSign = sign;
    reachScale = scale.slice(0, 4);
    reachTrouble = [];
    reachZeroFrom = "arm";
    reachOnArm = true;

    reachSentCal = reachCalSignature();

    for (var k = 0; k < sign.length; ++k) reachSignChoice[k] = sign[k];

    reachCheckLattice();
    reachSolve2();
    reachPaint();
    reachPaintPanels();
}

function reachSave() {
    try {
        localStorage.setItem(REACH_KEY, JSON.stringify({
            zero: reachZero, sign: reachSign, scale: reachScale, poses: reachCaptured,
        }));
    } catch (e) {  }
}

function reachCapturePose(which) {
    reachWaiting = which;
    reachNote("reading the servos for " + REACH_POSES[which].name + "...");

    if (!armCommand("state", "state", true)) {
        reachWaiting = -1;
        reachNote("no link to the arm, so nothing was captured");
        return;
    }

    setTimeout(function () {
        if (reachWaiting !== which) return;

        reachWaiting = -1;
        reachNote("the arm did not answer, so " + REACH_POSES[which].name + " was not captured");
        reachPaintPanels();
    }, 1500);
}

function reachTakeCapture() {
    var which = reachWaiting;
    reachWaiting = -1;

    if ((which < 0) || (which >= REACH_POSES.length)) return;

    if (armState.length < 4) {
        reachNote("no joints to capture - is the arm plugged in?");
        return;
    }

    var read = [];

    for (var j = 0; j < 4; ++j) {
        if (!armState[j] || !armState[j].here) {
            reachNote("joint " + (j + 1) + " is not answering, so this pose cannot be captured");
            return;
        }

        read.push(armState[j].deci / 10);
    }

    reachCaptured[REACH_POSES[which].name] = read;

    var solved = reachDeriveMapping();
    reachSave();

    if (reachTrouble.length) {
        reachNote(REACH_POSES[which].name + " captured, but " + reachTrouble[0]);
    }
    else if (solved < 4) {
        reachNote(REACH_POSES[which].name + " captured. " + reachWanted());
    }
    else {
        reachNote("calibrated: every joint's direction and zero come from the poses now");
    }

    reachMapCaptured();

    reachCheckLattice();
    reachSolve2();
    reachPaint();
    reachPaintPanels();
}

function reachWanted() {
    var want = [];
    var names = ["pan", "lift", "elbow", "wrist"];

    for (var j = 0; j < 4; ++j) {
        var pairs = 0;

        for (var a = 0; a < REACH_POSES.length; ++a) {
            for (var b = a + 1; b < REACH_POSES.length; ++b) {
                if (reachCaptured[REACH_POSES[a].name] && reachCaptured[REACH_POSES[b].name]
                    && (Math.abs(REACH_POSES[b].q[j] - REACH_POSES[a].q[j]) >= 1)) {
                    ++pairs;
                }
            }
        }

        if (!pairs) want.push(names[j]);
    }

    return want.length ? ("Still nothing for " + want.join(", ") + ".") : "";
}

const REACH_MAP_POSES = [0, 3, 1, 4, 5];

function reachMapShow(which) {
    reachShow(which);
    if (reachShowPose === which) armCommand("torque/all/off", "Go limp", true);
}

function reachMapClose() {
    if (reachShowPose < 0) return;

    reachShowPose = -1;
    reachPaint();
    reachPaintPanels();
}

function reachMapCaptured() {
    var all = REACH_MAP_POSES.every(function (k) {
        return reachPosePossible(k) || reachCaptured[REACH_POSES[k].name];
    });

    if (!all || (reachZeroFrom !== "poses")) return;

    reachMapClose();
    armCommand("torque/all/on", "Hold", true);
    reachNote("the model matches the arm now. The arm holds again");
}

function reachShow(which) {
    reachShowPose = (reachShowPose === which) ? -1 : which;
    reachNote((reachShowPose < 0) ? ""
              : (REACH_POSES[which].name + ": " + REACH_POSES[which].how));
    reachPaint();
    reachPaintPanels();
}

function reachForgetCalibration() {
    reachCaptured = {};
    reachZero = null;
    reachSign = [1, 1, 1, 1, 1];
    reachScale = [1, 1, 1, 1];
    reachTrouble = [];
    reachShowPose = -1;
    reachZeroFrom = "";
    reachOnArm = false;

    reachSentCal = "";
    armCommand("calib/forget", "calib");

    reachSave();
    reachNote("calibration forgotten, here and on the arm");
    reachCheckLattice();
    reachPaint();
    reachPaintPanels();
}

function reachLimp() {
    armCommand("torque/all/off", "Go limp");
    reachNote("limp - hold the arm up, put it in the pose, then press Done");
}

function reachSetDirect(on) {
    reachDirect = !!on;

    try { localStorage.setItem(REACH_DIRECT_KEY, reachDirect ? "1" : "0"); } catch (e) {}

    reachNote(reachDirect ? "the keys drive the arm" : "the keys move the target only - enter sends it");
}

function reachLoadZero() {
    reachGlLoad();

    try {
        var direct = localStorage.getItem(REACH_DIRECT_KEY);
        if (direct !== null) reachDirect = (direct === "1");

        reachShowAll = (localStorage.getItem(REACH_SHOWALL_KEY) === "1");
    }
    catch (e) {}

    try {
        var flips = JSON.parse(localStorage.getItem(REACH_SIGN_KEY) || "null");
        if (flips && (flips.length >= 4)) {
            for (var f = 0; f < flips.length; ++f) reachSignChoice[f] = flips[f];
        }
    }
    catch (e) {}

    try {
        var saved = JSON.parse(localStorage.getItem(REACH_KEY) || "null");
        if (!saved) return;
        if (saved.zero && (saved.zero.length === 4)) reachZero = saved.zero;
        if (saved.sign && (saved.sign.length >= 5)) reachSign = saved.sign;
        if (saved.scale && (saved.scale.length === 4)) reachScale = saved.scale;
        if (saved.poses) reachCaptured = saved.poses;

        if (saved.from && saved.forward && (saved.forward.length === 4)) {
            reachForwardRead = saved.forward;
            reachZeroFrom = saved.from;
            reachOneWhich = (saved.which === 1) ? 1 : 0;
        }
    } catch (e) {}
}

function reachAimAt(wanted) {
    var near = reachNowQ();
    var direct = reachClosest(wanted, near);

    if (direct.ok) return { at: wanted, solution: direct, short: false };

    var anchor = reachAnchor;

    if (!anchor) {
        var live = reachLiveAngles();

        if (!live) return { at: wanted, solution: direct, short: false };

        anchor = reachJoints(live[0], live[1], live[2], live[3])[4];
    }
    var best = null;
    var low = 0, high = 1;

    for (var step = 0; step < 12; ++step) {
        var mid = (low + high) / 2;
        var test = { x: anchor.x + ((wanted.x - anchor.x) * mid),
                     y: anchor.y + ((wanted.y - anchor.y) * mid),
                     z: anchor.z + ((wanted.z - anchor.z) * mid) };
        var got = reachClosest(test, near);

        if (got.ok) { best = { at: test, solution: got }; low = mid; }
        else high = mid;
    }

    if (!best) return { at: wanted, solution: direct, short: false };

    best.short = true;
    return best;
}

function reachSolve2() {
    if (reachSph && reachSph.solution && (reachAsked === reachSph.at)) {
        reachTarget = reachSph.at;
        reachSolution = reachSph.solution;
        reachShort = false;
        return;
    }

    if (reachAsked) {
        var aimed = reachAimAt(reachAsked);

        reachTarget = aimed.at;
        reachSolution = aimed.solution;
        reachShort = aimed.short;
        return;
    }

    reachSolution = reachTarget ? reachClosest(reachTarget, reachNowQ()) : null;
}

var reachShort = false;
var reachAnchor = null;

function reachSetTarget(point) {
    reachAsked = point;
    reachTarget = point;
    reachSolve2();

    if (reachSolution && reachSolution.ok) {
        reachAnchor = { x: reachTarget.x, y: reachTarget.y, z: reachTarget.z };
    }
    reachLockedCursor(true);
    reachPaint();
    reachPaintPanels();
}

function reachLockedCursor(on) {
    var canvas = document.getElementById("reachview");
    if (canvas) canvas.classList.toggle("reachlocked", on);
}

function reachCancel() {
    reachTarget = null;
    reachAsked = null;
    reachAnchor = null;
    reachShort = false;
    reachSolution = null;
    reachLockedCursor(false);
    reachNote("");
    reachPaint();
    reachPaintPanels();
}

function reachHome() {
    reachCam = { yaw: -0.9, pitch: 0.42, dist: 1.0 };
    reachLook = { x: 0.0, y: 0.0, z: 0.20 };
    reachPaint();
}

function reachPaintPanels() {
    var mm = function (v) { return Math.round(v * 1000) + "mm"; };

    var set = function (id, text, bad) {
        var el = document.getElementById(id);
        if (!el) return;
        el.textContent = text;
        if (bad !== undefined) el.className = bad ? "reachline reachbad" : "reachline";
    };

    var sph = reachTarget ? reachSphFrom(reachTarget, (reachSolution && reachSolution.q)
                                                      ? reachSolution.q[0] : undefined) : null;

    set("reach-az", sph ? (Math.round(sph.az) + "°") : "—");
    set("reach-el", sph ? (Math.round(sph.el) + "°") : "—");
    set("reach-r", sph ? (Math.round(sph.r * 1000) + "mm") : "—");

    set("reach-x", reachTarget ? mm(reachTarget.x) : "—");
    set("reach-y", reachTarget ? mm(reachTarget.y) : "—");
    set("reach-z", reachTarget ? mm(reachTarget.z) : "—");

    var state = document.getElementById("reach-state");
    var ok = document.getElementById("reach-ok");

    if (ok) {
        ok.textContent = !reachTarget ? "nothing picked"
                       : (reachSolution.ok
                            ? ((reachShort ? "as far as it goes, elbow " : "the arm can do that, elbow ")
                               + (reachSolution.elbowUp ? "up" : "down")
                               + ", " + Math.round(reachSolution.margin) + "\u00B0 to spare")
                            : reachSolution.why);
    }
    if (state) {
        state.className = (reachTarget && !reachSolution.ok) ? "reachline reachbad" : "reachline";
    }

    var names = ["reach-q1", "reach-q2", "reach-q3", "reach-q4"];

    for (var j = 0; j < 4; ++j) {
        var have = reachSolution && reachSolution.q;
        set(names[j], have ? (reachDegrees(reachSolution.q[j]) + "°") : "—");
    }

    var zeroed = document.getElementById("reach-zeroed");
    if (zeroed) {
        zeroed.textContent = reachZero ? "calibrated"
                           : (reachTrouble.length ? ("Go is off \u2014 " + reachTrouble[0])
                                                  : ("not calibrated, Go is off. " + reachWanted()));
        zeroed.parentNode.className = (!reachZero && reachTrouble.length) ? "reachline reachbad"
                                                                         : "reachline";
    }

    for (var c = 0; c < 4; ++c) {
        var cell = document.getElementById("reach-cal" + c);
        if (!cell) continue;

        if (!reachZero) {
            cell.textContent = reachScale[c] ? ("scale " + (Math.round(reachScale[c] * 100) / 100)
                                                + ", not believed") : "\u2014";
            cell.parentNode.className = reachScale[c] ? "reachline reachbad" : "reachline";
            continue;
        }

        cell.textContent = ((reachSign[c] > 0) ? "+" : "\u2212") + " zero "
                         + (Math.round(reachZero[c] * 10) / 10) + "\u00B0, scale "
                         + (Math.round(reachScale[c] * 100) / 100);
        cell.parentNode.className = (Math.abs(reachScale[c] - 1) > 0.15) ? "reachline reachbad" : "reachline";
    }

    var list = document.getElementById("reach-poses");

    if (list && !list.children.length) {
        REACH_MAP_POSES.forEach(function (k) {
            var row = document.createElement("div");
            row.className = "armrow poserow";

            var name = document.createElement("span");
            name.className = "armname";
            name.id = "reach-pose" + k;

            var show = document.createElement("button");
            show.type = "button";
            show.id = "reach-show" + k;
            show.textContent = "Show";
            show.title = "draw it in blue, and let the arm go limp to be put there";
            show.onclick = function () { reachMapShow(k); };

            var done = document.createElement("button");
            done.type = "button";
            done.id = "reach-done" + k;
            done.textContent = "Done";
            done.title = "the arm is there: read the servos";
            done.onclick = function () { reachCapturePose(k); };

            row.appendChild(name);
            row.appendChild(show);
            row.appendChild(done);
            list.appendChild(row);
        });
    }

    REACH_MAP_POSES.forEach(function (k) {
        var label = document.getElementById("reach-pose" + k);
        var cannot = reachPosePossible(k);

        if (label) {
            label.textContent = REACH_POSES[k].name;
            label.title = cannot ? ("not on this arm: " + cannot) : REACH_POSES[k].how;
            label.style.opacity = cannot ? "0.5" : "";
        }

        var shown = document.getElementById("reach-show" + k);
        if (shown) shown.classList.toggle("reachon", reachShowPose === k);

        var done = document.getElementById("reach-done" + k);
        if (done) {
            done.classList.toggle("reachon", !!reachCaptured[REACH_POSES[k].name]);
            done.disabled = !!cannot;
        }
    });

    for (var L = 0; L < 4; ++L) {
        var live = document.getElementById("reach-live" + L);
        if (!live) continue;

        var joint = armState[L];

        if (!joint || !joint.here) { live.textContent = "not answering"; continue; }

        var servo = joint.deci / 10;
        var text = (Math.round(servo * 10) / 10) + "\u00B0 servo";

        if (reachZero) {
            text += ", " + (Math.round((servo - reachZero[L]) * reachSign[L] * 10) / 10)
                  + "\u00B0 model";
        }

        live.textContent = text;
    }

    var age = document.getElementById("reach-age");

    if (age) {
        var since = reachStateAt ? (Date.now() - reachStateAt) : -1;
        age.textContent = (since < 0) ? "never" : ((Math.round(since / 100) / 10) + "s ago");

        var stale = (since < 0) || (since > 2000);
        var line = document.getElementById("reach-ageline");
        if (line) line.className = stale ? "reachline reachbad" : "reachline";
    }

    var byjoint = document.getElementById("reach-joints");

    if (byjoint && !byjoint.children.length) {
        var titles = ["pan", "lift", "elbow", "wrist", "roll", "gripper"];

        for (var r = 0; r < titles.length; ++r) {
            var row = document.createElement("div");
            row.className = "reachctl";

            var tag = document.createElement("b");
            tag.textContent = titles[r];
            tag.style.minWidth = "52px";
            tag.style.opacity = "0.65";
            tag.style.fontWeight = "normal";

            var down = document.createElement("button");
            down.type = "button";
            down.textContent = "\u2212";
            down.onclick = (function (which) {
                return function (e) { armJog(which, e.shiftKey ? -10 : -50); };
            })(r);

            var up = document.createElement("button");
            up.type = "button";
            up.textContent = "+";
            up.onclick = (function (which) {
                return function (e) { armJog(which, e.shiftKey ? 10 : 50); };
            })(r);

            var now = document.createElement("span");
            now.className = "armid";
            now.id = "reach-at" + r;

            row.appendChild(tag);
            row.appendChild(down);
            row.appendChild(up);
            row.appendChild(now);
            byjoint.appendChild(row);
        }
    }

    for (var a = 0; a < 6; ++a) {
        var at = document.getElementById("reach-at" + a);
        if (!at) continue;

        var joint = armState[a];

        at.textContent = (joint && joint.here)
            ? ((Math.round(joint.deci) / 10) + "\u00B0 of " + (Math.round(joint.mindeci) / 10)
               + " to " + (Math.round(joint.maxdeci) / 10))
            : "not answering";
    }

    var grip = document.getElementById("reach-grip");

    if (grip) {
        grip.textContent = reachGripJoint() ? (reachGrabbed() ? "Grabbed" : "Not grabbed")
                                            : "No gripper";
        grip.style.fontWeight = reachGrabbed() ? "bold" : "";
    }

    var arrows = document.getElementById("reach-planearrows");
    if (arrows) arrows.hidden = !reachLock;

    var planeat = document.getElementById("reach-planeat");
    if (planeat) planeat.textContent = reachLock
        ? (reachLock + " " + Math.round(reachLockAt * 1000)) : "";

    var direct = document.getElementById("reach-direct");
    if (direct && (direct.checked !== reachDirect)) direct.checked = reachDirect;

    var showall = document.getElementById("reach-showall");
    if (showall && (showall.checked !== reachShowAll)) showall.checked = reachShowAll;

    var webgl = document.getElementById("reach-webgl");
    if (webgl && (webgl.checked !== reachGlWanted)) webgl.checked = reachGlWanted;

    var glstate = document.getElementById("reach-glstate");
    if (glstate) glstate.textContent = (reachGlWanted && reachGl) ? "on"
                                     : (reachGlBroken || "off \u2014 drawn in 2D");

    var from = document.getElementById("reach-from");

    if (from) {
        from.textContent = !reachZero ? (reachTrouble.length ? ("not mapped \u2014 " + reachTrouble[0])
                                                           : "not mapped yet, so Go is off")
                         : ((reachZeroFrom === "arm") ? "matches, from the arm's flash"
                         : ((reachZeroFrom === "poses") ? "matches, measured from the poses"
                         : ((reachZeroFrom === "forward") ? "matches, from one pose"
                                                          : "a guess from the joint limits")));
        from.parentNode.className = (!reachZero && reachTrouble.length) ? "reachline reachbad" : "reachline";
    }

    var flips = document.getElementById("reach-flips");

    if (flips && !flips.children.length) {
        for (var f = 0; f < REACH_JOINTS; ++f) {
            var button = document.createElement("button");
            button.type = "button";
            button.id = "reach-flip" + f;
            button.title = "flip which way this joint counts";
            button.onclick = (function (which) { return function () { reachFlipJoint(which); }; })(f);
            flips.appendChild(button);
        }
    }

    for (var g = 0; g < REACH_JOINTS; ++g) {
        var flip = document.getElementById("reach-flip" + g);

        if (flip) {
            flip.textContent = ["pan", "lift", "elbow", "wrist", "roll", "grip"][g]
                             + ((reachSignChoice[g] > 0) ? " +" : " \u2212")
                             + (reachGuessed[g] ? " ?" : "");
            flip.disabled = (reachZeroFrom === "poses");
            flip.title = reachGuessed[g]
                ? "this one could be either way round - flip it if the arm is mirrored here"
                : "the fit settled this one; flip only if it is plainly wrong";
        }
    }

    var grid = document.getElementById("reach-grid");
    if (grid) grid.textContent = reachGridMm ? ("Grid " + reachGridMm + "mm") : "Grid off";

    for (var axis = 0; axis < 3; ++axis) {
        var name = ["x", "y", "z"][axis];
        var button = document.getElementById("reach-lock" + name);

        if (button) button.style.fontWeight = (reachLock === name) ? "bold" : "";

        var pin = document.getElementById("reach-pin" + name);
        if (pin) pin.classList.toggle("reachon", reachLock === name);
    }

    var lockval = document.getElementById("reach-lockval");

    if (lockval) {
        lockval.textContent = reachLock
            ? (reachLock + " = " + Math.round(reachLockAt * 1000) + "mm, "
               + REACH_SLICE_MM + "mm steps")
            : "free \u2014 the whole volume";
    }

    var points = document.getElementById("reach-points");
    if (points && reachBuild) {
        points.textContent = "working out " + Math.round(100 * (reachBuild.zi - reachBuild.z0)
                                                         / Math.max(1, reachBuild.up + 1 - reachBuild.z0)) + "%";
    }
    else if (points) {
        points.textContent = !reachGridMm ? "grid off"
                           : (reachLattice.filter(function (p) { return p.margin >= 0; }).length
                              + " of " + reachLattice.length + (reachBandIsReal ? " calibrated" : " by shape"))
                             + (reachLock ? (", " + reachSlice.length + " on the plane") : "");
    }
}

function reachPickAt(px, py) {
    var picked = (reachHover >= 0) ? reachLive()[reachHover] : null;
    var hit = picked ? { x: picked.x, y: picked.y, z: picked.z }
           : (reachLock ? reachUnprojectAxis(reachBasis(), px, py, reachLock, reachLockAt)
                        : reachUnproject(reachBasis(), px, py, REACH_CLEARANCE));

    if (!hit) return;

    reachSetTarget(hit);
    reachSph = reachSphFrom(reachTarget, (reachSolution && reachSolution.q) ? reachSolution.q[0] : undefined);

    reachNote("picked \u2014 double click to go there");
}

function reachBind() {
    var canvas = document.getElementById("reachview");
    if (!canvas) return;

    canvas.addEventListener("dblclick", function (e) {
        reachGo();
        e.preventDefault();
    });

    canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

    canvas.addEventListener("pointerdown", function (e) {
        var box = canvas.getBoundingClientRect();
        var px = e.clientX - box.left, py = e.clientY - box.top;

        if (e.button === 2) {
            canvas.setPointerCapture(e.pointerId);
            reachHeld = {};
            reachFly = { x: px, y: py, moved: 0, flew: false, keys: {}, at: 0 };
            canvas.classList.add("reachflying");
            requestAnimationFrame(reachFlyStep);
            e.preventDefault();
            return;
        }

        if (e.button !== 0) return;

        if (e.pointerType === "touch") {
            reachMouse = { x: px, y: py };
            reachPaint();
            reachHover = reachNearest(px, py);
        }

        canvas.setPointerCapture(e.pointerId);

        var onTarget = false;

        if (reachTarget) {
            var s = reachProject(reachBasis(), reachTarget);
            onTarget = s && (Math.abs(s.x - px) < 16) && (Math.abs(s.y - py) < 16);
        }

        reachDrag = {
            mode: onTarget ? "target" : "orbit",
            x: px, y: py, moved: 0,
            yaw: reachCam.yaw, pitch: reachCam.pitch,
            start: reachTarget ? { x: reachTarget.x, y: reachTarget.y, z: reachTarget.z } : null,
        };

        canvas.classList.add("reachdragging");
        e.preventDefault();
    });

    canvas.addEventListener("pointermove", function (e) {
        var hbox = canvas.getBoundingClientRect();

        reachMouse = { x: e.clientX - hbox.left, y: e.clientY - hbox.top };

        if (reachFly) {
            var fx = reachMouse.x - reachFly.x, fy = reachMouse.y - reachFly.y;

            reachFly.x = reachMouse.x;
            reachFly.y = reachMouse.y;
            reachFly.moved += Math.abs(fx) + Math.abs(fy);

            if (reachFly.moved >= 5) {
                reachFlyLook(fx, fy);
                reachPaint();
            }

            e.preventDefault();
            return;
        }

        if (!reachDrag) {
            reachTrack();
            return;
        }

        var box = canvas.getBoundingClientRect();
        var px = e.clientX - box.left, py = e.clientY - box.top;
        var dx = px - reachDrag.x, dy = py - reachDrag.y;

        reachDrag.moved = Math.max(reachDrag.moved, Math.abs(dx) + Math.abs(dy));

        if (reachDrag.mode === "orbit") {
            reachCam.yaw = reachDrag.yaw - (dx * 0.008);
            reachCam.pitch = Math.max(-0.2, Math.min(1.45, reachDrag.pitch + (dy * 0.006)));
            reachPaint();
            e.preventDefault();
            return;
        }

        if (reachLock) {
            var onPlane = reachUnprojectAxis(reachBasis(), px, py, reachLock, reachLockAt);
            if (onPlane) reachSetTarget(onPlane);
            e.preventDefault();
            return;
        }

        if (e.shiftKey) {
            reachSetTarget({
                x: reachDrag.start.x,
                y: reachDrag.start.y,
                z: Math.max(REACH_CLEARANCE, Math.min(0.6, reachDrag.start.z - (dy * 0.0012))),
            });
        }
        else {
            var hit = reachUnproject(reachBasis(), px, py, reachDrag.start.z);
            if (hit) reachSetTarget(hit);
        }

        e.preventDefault();
    });

    var letGo = function (e) {
        if (reachFly) {
            var still = (reachFly.moved < 5) && !reachFly.flew;

            reachFly = null;
            canvas.classList.remove("reachflying");

            if (still) reachCancel();
            if (e) e.preventDefault();
            return;
        }

        if (!reachDrag) return;

        var wasClick = (reachDrag.moved < 5);
        var at = { x: reachDrag.x, y: reachDrag.y };

        reachDrag = null;
        canvas.classList.remove("reachdragging");

        if (wasClick) reachPickAt(at.x, at.y);
        if (e) e.preventDefault();
    };

    canvas.addEventListener("pointerup", letGo);

    canvas.addEventListener("pointerleave", function () {
        if (reachDrag) return;

        reachMouse = null;
        reachHover = -1;
        reachPaint();
    });
    canvas.addEventListener("pointercancel", letGo);
    canvas.addEventListener("lostpointercapture", letGo);

    canvas.addEventListener("wheel", function (e) {
        var way = ((e.deltaY || e.deltaX) < 0) ? 1 : -1;

        if (!e.ctrlKey) {
            if (reachLock || e.shiftKey) reachPlaneStep(way);
            else reachTorchBy(way);

            e.preventDefault();
            return;
        }

        var k = (e.deltaY > 0) ? 1.1 : 0.9;
        var dist = Math.max(0.15, Math.min(3, reachCam.dist * k));

        k = dist / reachCam.dist;

        var zbox = canvas.getBoundingClientRect();
        var zx = e.clientX - zbox.left, zy = e.clientY - zbox.top;
        var under = ((reachHover >= 0) && reachScreen[reachHover]) ? reachLive()[reachHover]
                  : reachUnproject(reachBasis(), zx, zy, 0);

        if (under && (reachDotP(reachSub(under, reachBasis().eye), reachBasis().f) < 3)) {
            reachLook = reachAdd(under, reachSub(reachLook, under), k);
        }

        reachCam.dist = dist;
        reachPaint();
        e.preventDefault();
    }, { passive: false });
}

var reachSentDeg = [];

function reachGo(quiet, seconds) {
    if (!reachTarget || !reachSolution) {
        reachNote("nothing picked - click a dot to put a target down");
        return;
    }

    if (!reachSolution.ok) {
        reachNote("not going: " + reachSolution.why);
        return;
    }

    if (!reachZero) {
        reachNote("no calibration: the joints need their limits taught in the Calibration menu first, "
                  + "and this tab takes the mapping from those");
        return;
    }

    for (var j = 0; j < 4; ++j) {
        var joint = armState[j];
        if (!joint || !joint.here) continue;

        var degrees = Math.round(reachServoDegrees(j, reachSolution.q[j]) * 10) / 10;
        var command = "move/" + (j + 1) + "/" + degrees;

        if (seconds) {
            var from = (reachSentDeg[j] !== undefined) ? reachSentDeg[j] : (joint.deci / 10);
            var steps = Math.abs(degrees - from) * 4096 / 360;

            if (steps < 1) continue;

            command += "/" + Math.max(30, Math.min(3400, Math.round((steps / seconds) * 1.3)));
        }

        reachSentDeg[j] = degrees;

        armCommand(command, "move", true);
    }

    if (!quiet) reachNote("sent");
}

var reachMoved = null;
var reachFitted = false;

function reachAdopt(id, slot) {
    var el = document.getElementById(id);
    var to = document.getElementById(slot);
    if (!el || !to || (el.parentNode === to)) return;

    if (!reachMoved) reachMoved = {};
    if (!reachMoved[id]) reachMoved[id] = [el.parentNode, el.nextSibling];
    to.appendChild(el);
}

function reachRelease(id) {
    var el = document.getElementById(id);
    var home = reachMoved && reachMoved[id];
    if (el && home && (el.parentNode !== home[0])) home[0].insertBefore(el, home[1]);
}

function reachLayout() {
    var stage = document.getElementById("reach-stage");
    if (!stage) return;

    var on = reachVisible();
    document.documentElement.classList.toggle("reachfit", on);

    if (!on) {
        reachRelease("hud");
        reachRelease("toasts");
        reachFitted = false;
        return;
    }

    reachAdopt("hud", "reach-hudslot");
    reachAdopt("toasts", "reach-toastslot");

    if (!reachFitted) window.scrollTo(0, 0);
    reachFitted = true;

    var full = reachFaux || (reachFullElement() === stage);
    stage.classList.toggle("reachfull", full);
    stage.classList.toggle("reachfaux", reachFaux);
    var height = full ? window.innerHeight
                      : Math.max(320, Math.floor(window.innerHeight - stage.getBoundingClientRect().top - 10));

    if (stage.style.height !== (height + "px")) {
        stage.style.height = height + "px";
        reachPaint();
    }

    var button = document.getElementById("reach-full");
    if (button) button.classList.toggle("reachon", full);
}

var reachFaux = false;

function reachFullElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function reachSetFaux(on) {
    reachFaux = on;
    reachLayout();
    reachPaint();
}

function reachFullscreen() {
    var stage = document.getElementById("reach-stage");
    if (!stage) return;

    if (reachFaux) { reachSetFaux(false); return; }

    if (reachFullElement()) {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        return;
    }

    var allowed = document.fullscreenEnabled || document.webkitFullscreenEnabled;
    var request = stage.requestFullscreen || stage.webkitRequestFullscreen;

    if (!allowed || !request) { reachSetFaux(true); return; }

    try {
        var asked = request.call(stage);
        if (asked && asked.catch) asked.catch(function () { reachSetFaux(true); });
    }
    catch (e) { reachSetFaux(true); return; }

    setTimeout(function () {
        if (!reachFullElement() && !reachFaux) reachSetFaux(true);
    }, 600);
}

function reachPoll() {
    if (!reachVisible()) return;

    armCommand("state", "state", true);

    if (!reachAskedArm && handler && handler.ws && (handler.ws.readyState === WebSocket.OPEN)) {
        reachAskedArm = true;
        armCommand("calib", "calib", true);
        poseRefresh();
    }

    reachStep("readouts", reachPaintPanels);
    reachStep("limits", reachCheckLattice);
    reachStep("solving", reachSolve2);
    reachStep("drawing", reachPaint);
}

var reachLastError = "";

function reachStep(what, work) {
    try {
        work();

        if (reachLastError.indexOf(what + ":") === 0) reachLastError = "";
    }
    catch (e) {
        reachLastError = what + ": " + String((e && e.message) || e);
        console.log("reach " + reachLastError, e);

        var note = document.getElementById("reach-note");
        if (note) note.textContent = reachLastError;
    }
}

var reachSph = null;
function reachSphFrom(point, pan) {
    var az = (pan === undefined) ? Math.atan2(point.y, point.x) : pan;
    var along = (point.x * Math.cos(az)) + (point.y * Math.sin(az));
    var out = along - REACH.shoulderR;
    var up = point.z - (REACH.plateZ + REACH.shoulderZ);

    return { az: az * 180 / Math.PI, el: Math.atan2(up, out) * 180 / Math.PI,
             r: Math.sqrt((out * out) + (up * up)) };
}

function reachSphTo(sph) {
    var az = sph.az * Math.PI / 180;
    var el = sph.el * Math.PI / 180;
    var along = REACH.shoulderR + (sph.r * Math.cos(el));

    return { x: along * Math.cos(az), y: along * Math.sin(az),
             z: REACH.plateZ + REACH.shoulderZ + (sph.r * Math.sin(el)) };
}

const REACH_TICK_MS = 70;
const REACH_RATE_TURN = 50;
const REACH_RATE_REACH = 0.13;

const REACH_RATE_ROLL = 150;
var reachHeld = {};
var reachFine = false;
var reachTickTimer = null;

var reachFeel = "";

function reachSay(text) {
    if (text === reachFeel) return;

    reachFeel = text;
    reachNote(text);
}

function reachDriveWrist(arc, out, tilt) {
    var prevQ = (reachSph && reachSph.solution) ? reachSph.solution.q : reachLiveAngles();
    if (!prevQ) return;

    if (!reachSph) reachSentDeg = [];

    var c = Math.cos(prevQ[0]), sn = Math.sin(prevQ[0]);
    var wrist = reachJoints(prevQ[0], prevQ[1], prevQ[2], prevQ[3])[3];
    var bz = REACH.plateZ + REACH.shoulderZ;
    var pitch = prevQ[1] + prevQ[2] + prevQ[3];

    var u = (wrist.x * c) + (wrist.y * sn) - REACH.shoulderR;
    var v = wrist.z - bz;
    var radius = Math.sqrt((u * u) + (v * v));
    var round = Math.atan2(u, v);
    var most = REACH.upper + REACH.fore, least = Math.abs(REACH.upper - REACH.fore) + 0.002;

    pitch -= tilt;

    var tries = reachDriveTries(tilt ? "" : (out ? "round" : "radius"));
    var steps = tilt ? [1] : [1, 0.5, 0.25];
    var best = null, used = null, first = null;

    for (var k = 0; (k < steps.length) && !best; ++k) {
        for (var t = 0; (t < tries.length) && !best; ++t) {
            var give = tries[t];
            var rad = radius + (out * steps[k]) + ((give.axis === "radius") ? give.d : 0);
            var rnd = round + (arc * steps[k]) + ((give.axis === "round") ? give.d : 0);

            if ((rad > most) || (rad < least)) continue;

            var got = reachWristPose(prevQ, rad, rnd, pitch + give.p);

            if (got.ok) { best = got; used = { give: give, radius: rad, round: rnd }; }
            else if (!first) first = got;
        }
    }

    if (!best) {
        var why = (first && first.why) ? (" - " + first.why) : "";

        reachSay(tilt ? "the wrist will not tilt further that way"
                      : ((out < 0) ? ("cannot pull in further" + why)
                                   : ((out > 0) ? ("cannot reach out further" + why)
                                                : ("cannot go further round" + why))));
        return;
    }

    var round2 = used.round * 180 / Math.PI;
    var gave = [];

    if (used.give.d && (used.give.axis === "round")) gave.push("slid " + Math.abs(Math.round(used.give.d * 180 / Math.PI)) + "\u00B0 round");
    if (used.give.d && (used.give.axis === "radius")) gave.push("circle " + ((used.give.d > 0) ? "grew " : "shrank ")
                                                              + Math.abs(Math.round(used.give.d * 1000)) + "mm");
    if (used.give.p) gave.push("gripper gave " + Math.abs(Math.round(used.give.p * 180 / Math.PI)) + "\u00B0");

    var tipped = ((((best.pitch * 180 / Math.PI) + 180) % 360) + 360) % 360 - 180;

    reachDriveApply(best, tilt ? ("gripper at " + Math.round(tipped) + "\u00B0 from straight up")
                               : ("wrist on a " + Math.round(used.radius * 1000) + "mm circle, "
                                  + Math.abs(Math.round(round2)) + "\u00B0 " + ((round2 >= 0) ? "forward" : "back")
                                  + " of straight up" + (gave.length ? (" (" + gave.join(", ") + " to make room)") : "")));
}

var reachDriveTryCache = {};

function reachDriveTries(axis) {
    if (reachDriveTryCache[axis]) return reachDriveTryCache[axis];

    var list = [{ axis: axis, d: 0, p: 0, cost: 0 }];
    var deg = Math.PI / 180;

    if (axis) {
        for (var a = -20; a <= 20; ++a) {
            for (var b = -20; b <= 20; ++b) {
                if (!a && !b) continue;

                list.push({ axis: axis, d: (axis === "round") ? (a * 3 * deg) : (a * 0.003),
                            p: b * 3 * deg, cost: (a * a) + (0.5 * b * b) });
            }
        }

        list.sort(function (x, y) { return x.cost - y.cost; });
    }

    reachDriveTryCache[axis] = list;
    return list;
}

function reachWristPose(prevQ, radius, round, pitch) {
    var c = Math.cos(prevQ[0]), sn = Math.sin(prevQ[0]);
    var along = REACH.shoulderR + (radius * Math.sin(round));
    var height = REACH.plateZ + REACH.shoulderZ + (radius * Math.cos(round));
    var r = along + (REACH.tip * Math.sin(pitch));
    var target = { x: r * c, y: r * sn, z: height + (REACH.tip * Math.cos(pitch)) };
    var best = null, why = "";

    if (Math.abs(r) < 1e-4) { target.x += 1e-4 * c; target.y += 1e-4 * sn; r = 1e-4; }

    for (var n = 0; n < 2; ++n) {
        var got = reachSolve(target, pitch, n === 0, r < 0);

        if (!got.ok) { why = why || got.why; continue; }

        var away = 0, leap = false;

        for (var j = 0; j < 4; ++j) {
            var dq = got.q[j] - prevQ[j];
            if (Math.abs(dq) > REACH_MAX_JUMP[j]) leap = true;
            away += dq * dq;
        }

        if (leap) { why = why || "a jump too big for one step"; continue; }
        if (!best || (away < best.away)) { best = got; best.away = away; best.pitch = pitch; }
    }

    return best || { ok: false, why: why };
}

function reachDriveApply(best, say) {
    var at = reachJoints(best.q[0], best.q[1], best.q[2], best.q[3])[4];

    reachSph = reachSphFrom(at, best.q[0]);
    reachSph.at = at;
    reachSph.solution = best;
    reachAsked = at;
    reachTarget = at;
    reachSolution = best;
    reachShort = false;
    reachAnchor = { x: at.x, y: at.y, z: at.z };

    reachPaint();
    reachPaintPanels();
    reachSay(say);

    if (reachDirect && reachZero) reachGo(true, REACH_TICK_MS / 1000);
}

function reachDrivePan(degrees) {
    var prevQ = (reachSph && reachSph.solution) ? reachSph.solution.q : reachLiveAngles();
    if (!prevQ) return;

    if (!reachSph) reachSentDeg = [];

    var lo = reachBand[0][0], hi = reachBand[0][1];
    var now = prevQ[0] * 180 / Math.PI;
    var pan = Math.max(lo, Math.min(hi, now + degrees));

    if (Math.abs(pan - now) < 1e-6) {
        reachSay("at the turn limit, " + Math.round(now) + "\u00B0");
        return;
    }

    var q = prevQ.slice();
    q[0] = pan * Math.PI / 180;

    reachDriveApply({ ok: true, why: "", q: q, margin: 0, pitch: q[1] + q[2] + q[3] },
                    "turned to " + Math.round(pan) + "\u00B0" + ((pan === lo || pan === hi) ? ", the turn limit" : ""));
}

function reachTick() {
    if (!reachVisible()) { reachHeld = {}; return; }

    var keys = Object.keys(reachHeld);
    var gp = gpReach();
    var gpBusy = gp && (gp.az || gp.el || gp.r || gp.f || gp.g || gp.x || gp.c || gp.tiltDown || gp.tiltUp);

    if (!keys.length && !gpBusy) return;

    var seconds = REACH_TICK_MS / 1000;
    var slow = reachFine ? 0.25 : 1;
    var turn = REACH_RATE_TURN * seconds * slow;
    var push = REACH_RATE_REACH * seconds * slow;
    var spin = REACH_RATE_ROLL * seconds * slow;
    var daz = 0, arc = 0, out = 0, tilt = 0, roll = 0;
    var tip = REACH_RATE_TURN * seconds * slow * Math.PI / 180;

    if (reachHeld.a) daz += turn;
    if (reachHeld.d) daz -= turn;
    if (reachHeld.w) arc += tip;
    if (reachHeld.s) arc -= tip;
    if (reachHeld.q) out += push;
    if (reachHeld.z) out -= push;
    if (reachHeld.e) tilt -= tip;
    if (reachHeld.r) tilt += tip;
    if (reachHeld.x) roll += spin;
    if (reachHeld.c) roll -= spin;

    if (gp) {
        daz += turn * gp.az;
        arc += tip * gp.el;
        out += push * gp.r;
        if (gp.tiltDown) tilt -= tip;
        if (gp.tiltUp) tilt += tip;
        if (gp.x) roll += spin;
        if (gp.c) roll -= spin;
    }

    if (daz) reachDrivePan(daz);
    if (arc || out || tilt) reachDriveWrist(arc, out, tilt);

    var jaws = ((reachHeld.f || (gp && gp.f)) ? 1 : 0) - ((reachHeld.g || (gp && gp.g)) ? 1 : 0);
    if (jaws) reachJawMove(jaws > 0, REACH_RATE_JAWS * seconds * slow);

    if (roll && armState[4] && armState[4].here) armJog(4, Math.round(roll * 10));
}

document.addEventListener("keydown", function (event) {
    if (!reachVisible()) return;

    var tag = (event.target && event.target.tagName) ? event.target.tagName.toLowerCase() : "";
    if ((tag === "input") || (tag === "select") || (tag === "textarea")) return;

    var key = event.key.toLowerCase();

    reachFine = event.shiftKey;

    if (reachFly) {
        reachFly.keys.shift = event.shiftKey;

        if ("wasdqe".indexOf(key) >= 0) {
            reachFly.keys[key] = true;
            event.preventDefault();
        }

        return;
    }

    if (!event.ctrlKey && !event.altKey && !event.metaKey && ("wasdqzerxcfg".indexOf(key) >= 0)) {
        var already = reachHeld[key];
        reachHeld[key] = true;

        if (!already && ((key === "f") || (key === "g"))) reachJawStart(key === "f");

        if (!already) reachTick();

        event.preventDefault();
        return;
    }

    var slot = slotOf(event.code);

    if (slot && !event.ctrlKey && !event.altKey && !event.metaKey) {
        if (!event.repeat) slotKey(slot, event.shiftKey);
    }
    else if ((key === "=") || (key === "+")) gripSetStrength(gripStrength + GRIP_STRENGTH_STEP);
    else if ((key === "-") || (key === "_")) gripSetStrength(gripStrength - GRIP_STRENGTH_STEP);
    else if (key === "enter") reachGo();
    else if (key === "home") reachHome();
    else if (key === "escape") {
        reachSph = null;
        reachHeld = {};
        reachCancel();
    }
    else return;

    event.preventDefault();
});

document.addEventListener("keyup", function (event) {
    var key = event.key.toLowerCase();

    if (reachHeld[key]) delete reachHeld[key];
    if (reachFly) { delete reachFly.keys[key]; reachFly.keys.shift = event.shiftKey; }

    reachFine = event.shiftKey;
});

window.addEventListener("blur", function () { reachHeld = {}; if (reachFly) reachFly.keys = {}; });

document.addEventListener("DOMContentLoaded", function () {
    reachLoadZero();
    gripLoadStrength();

    if (!navigator.getGamepads) {
    reachNote("this browser hides gamepads from http pages: in Chrome, add this address to "
    + "chrome://flags/#unsafely-treat-insecure-origin-as-secure");
    }
    reachBind();
    reachCheckLattice();
    reachPaintPanels();
    reachTimer = setInterval(reachPoll, REACH_POLL_MS);
    reachTickTimer = setInterval(reachTick, REACH_TICK_MS);
    setInterval(reachLayout, 200);
    window.addEventListener("resize", function () { reachLayout(); reachPaint(); });
    document.addEventListener("fullscreenchange", function () { reachLayout(); reachPaint(); });
    document.addEventListener("webkitfullscreenchange", function () { reachLayout(); reachPaint(); });
});
