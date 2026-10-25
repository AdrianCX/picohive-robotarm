const DRIVE_SEND_MS = 50;
const DRIVE_KEEPALIVE_MS = 500;
const DRIVE_DEADZONE = 0.10;
var driveX = 0, driveY = 0;
var driveAccX = 0, driveAccY = 0, driveAccN = 0;
var drivePower = { left: 0, right: 0 };
var driveSent = null;
var driveSentAt = 0;
var driveDragging = false;
var driveHeld = {};
var driveTimer = null;
var driveSizedFor = 0;
var driveShown = false;
var driveAt = null;

const DRIVE_AT_KEY = "robotarm.drive.at";

function driveVisible() {
    return driveShown && reachVisible();
}

function driveShow(show) {
    driveShown = (show === undefined) ? !driveShown : !!show;

    var panel = document.getElementById("drive-panel");
    if (panel) panel.hidden = !driveShown;

    var button = document.getElementById("drive-btn");
    if (button) button.classList.toggle("reachon", driveShown);

    if (driveShown) {
        if (driveAt) driveMovePanel(driveAt.x, driveAt.y);
        driveSizePad();
    }
}

function driveBindPanel() {
    var panel = document.getElementById("drive-panel");
    var grip = document.getElementById("drive-grip");
    if (!panel || !grip) return;

    try { driveAt = JSON.parse(localStorage.getItem(DRIVE_AT_KEY) || "null"); }
    catch (e) {  }

    var from = null;

    grip.addEventListener("pointerdown", function (event) {
        if (event.target.tagName.toLowerCase() === "button") return;

        grip.setPointerCapture(event.pointerId);
        from = { x: event.clientX - panel.offsetLeft, y: event.clientY - panel.offsetTop };
        event.preventDefault();
    });

    grip.addEventListener("pointermove", function (event) {
        if (!from) return;
        driveMovePanel(event.clientX - from.x, event.clientY - from.y);
    });

    var letGo = function () {
        if (!from) return;
        from = null;
        driveAt = { x: panel.offsetLeft, y: panel.offsetTop };

        try {
            localStorage.setItem(DRIVE_AT_KEY,
                                 JSON.stringify(driveAt));
        } catch (e) {  }
    };

    grip.addEventListener("pointerup", letGo);
    grip.addEventListener("pointercancel", letGo);
}

function driveMovePanel(x, y) {
    var panel = document.getElementById("drive-panel");
    var stage = document.getElementById("reach-stage");
    if (!panel || !stage) return;

    var maxX = stage.clientWidth - panel.offsetWidth;
    var maxY = stage.clientHeight - panel.offsetHeight;

    panel.style.left = Math.max(0, Math.min(maxX, x)) + "px";
    panel.style.top = Math.max(0, Math.min(maxY, y)) + "px";
    panel.style.right = "auto";
}

function driveKeepInside() {
    var panel = document.getElementById("drive-panel");
    if (panel && driveShown && panel.style.left) driveMovePanel(panel.offsetLeft, panel.offsetTop);
}

function driveNote(text) {
    var note = document.getElementById("drive-note");
    if (note) note.textContent = text;
}

function driveClamp1(v) { return (v < -1) ? -1 : ((v > 1) ? 1 : v); }

function driveColour(t) {
    t = (t < 0) ? 0 : ((t > 1) ? 1 : t);
    return "hsl(" + Math.round(t * 120) + ", 85%, 46%)";
}

var driveFlipFB = false;
var driveFlipLR = false;

const DRIVE_FLIP_KEY = "robotarm.drive.flip";

const DRIVE_KEY_POWER_MIN = 0.10;
const DRIVE_KEY_POWER_STEP = 0.10;
const DRIVE_POWER_KEY = "robotarm.drive.keypower";

var driveKeyPower = 0.40;

function driveKeyThrow() {
    return DRIVE_DEADZONE + (driveKeyPower * (1 - DRIVE_DEADZONE));
}

function driveSayPower() {
    var text = "keys at " + Math.round(driveKeyPower * 100) + "%";
    var out = document.getElementById("drive-keypower");

    if (out) out.textContent = Math.round(driveKeyPower * 100) + "%";

    if (reachVisible()) reachNote(text + " \u00b7 ] faster, [ slower");
}

function driveNudgePower(way) {
    var was = driveKeyPower;

    driveKeyPower = Math.max(DRIVE_KEY_POWER_MIN,
                             Math.min(1, driveKeyPower + (way * DRIVE_KEY_POWER_STEP)));

    driveKeyPower = Math.round(driveKeyPower * 100) / 100;

    try { localStorage.setItem(DRIVE_POWER_KEY, String(driveKeyPower)); }
    catch (e) {  }

    driveSayPower();

    if (driveKeyPower === was) return;

    driveApplyKeys();
    driveSend(true);
}

function driveSetFlip(which, on) {
    if (which === "fb") driveFlipFB = !!on;
    else driveFlipLR = !!on;

    try {
        localStorage.setItem(DRIVE_FLIP_KEY,
                             JSON.stringify({ fb: driveFlipFB, lr: driveFlipLR }));
    } catch (e) {  }

    driveApplyKeys();
    driveSend(true);
}

function driveLoadFlip() {
    try {
        var saved = JSON.parse(localStorage.getItem(DRIVE_FLIP_KEY) || "null");

        if (saved) {
            driveFlipFB = !!saved.fb;
            driveFlipLR = !!saved.lr;
        }
    } catch (e) {  }

    try {
        var power = parseFloat(localStorage.getItem(DRIVE_POWER_KEY));

        if (isFinite(power) && (power >= DRIVE_KEY_POWER_MIN) && (power <= 1)) {
            driveKeyPower = power;
        }
    } catch (e) {  }

    var fb = document.getElementById("drive-flip-fb");
    var lr = document.getElementById("drive-flip-lr");
    var out = document.getElementById("drive-keypower");

    if (fb) fb.checked = driveFlipFB;
    if (lr) lr.checked = driveFlipLR;
    if (out) out.textContent = Math.round(driveKeyPower * 100) + "%";
}

function driveMix(x, y) {
    var m = Math.sqrt((x * x) + (y * y));

    if (m > 1) { x /= m; y /= m; }

    if (driveFlipFB) y = -y;
    if (driveFlipLR) x = -x;

    return {
        left: Math.round(driveClamp1(y - x) * 100),
        right: Math.round(driveClamp1(y + x) * 100),
    };
}

function driveDeadzone(x, y) {
    var m = Math.sqrt((x * x) + (y * y));

    if (m < DRIVE_DEADZONE) return { x: 0, y: 0, live: false, speed: 0 };

    var speed = (m - DRIVE_DEADZONE) / (1 - DRIVE_DEADZONE);
    if (speed > 1) speed = 1;

    var scale = speed / m;
    return { x: x * scale, y: y * scale, live: true, speed: speed };
}

function drivePaintKnob() {
    var pad = document.getElementById("drivepad");
    var knob = document.getElementById("driveknob");
    if (!pad || !knob) return;

    var box = pad.getBoundingClientRect();
    knob.style.transform = "translate(" + (driveX * box.width / 2) + "px, "
                                        + (-driveY * box.height / 2) + "px)";
}

function drivePaintPuck(speed, live) {
    var knob = document.getElementById("driveknob");
    if (knob) knob.style.background = live ? driveColour(speed) : "#8B9095";
}

function drivePaintPower() {
    var sides = ["left", "right"];

    for (var s = 0; s < sides.length; ++s) {
        var power = drivePower[sides[s]];
        var value = document.getElementById("drive-" + sides[s]);
        var bar = document.getElementById("drive-" + sides[s] + "-bar");

        if (value) {
            value.textContent = power;
            value.className = (power < 0) ? "driveval rev" : "driveval";
        }

        if (bar) {
            var width = Math.abs(power) / 2;
            bar.style.left = (power >= 0) ? "50%" : (50 - width) + "%";
            bar.style.width = width + "%";
            bar.style.background = driveColour(Math.abs(power) / 100);
        }
    }
}

function driveSizePad() {
    var pad = document.getElementById("drivepad");
    var dead = document.getElementById("drivedead");
    if (!pad || !dead) return;

    var width = pad.getBoundingClientRect().width;
    if (!width || (width === driveSizedFor)) return;

    driveSizedFor = width;
    dead.style.width = (width * DRIVE_DEADZONE) + "px";
    dead.style.height = (width * DRIVE_DEADZONE) + "px";
    drivePaintKnob();
}

function driveCentre(sendStop) {
    driveX = 0;
    driveY = 0;
    driveAccX = 0;
    driveAccY = 0;
    driveAccN = 0;
    driveDragging = false;

    var pad = document.getElementById("drivepad");
    if (pad) pad.classList.remove("dragging");

    drivePaintKnob();
    drivePaintPuck(0, false);
    drivePower = { left: 0, right: 0 };
    drivePaintPower();

    if (sendStop) driveSend(true);
}

function driveStop() {
    driveHeld = {};
    driveCentre(true);
}

function driveSend(force) {
    var same = driveSent && (driveSent.left === drivePower.left)
                         && (driveSent.right === drivePower.right);
    var moving = (drivePower.left !== 0) || (drivePower.right !== 0);

    if (!force && same && (!moving || ((Date.now() - driveSentAt) < DRIVE_KEEPALIVE_MS))) return;

    if (!handler || !handler.ws || (handler.ws.readyState !== WebSocket.OPEN)) {
        driveNote("no link — the board stops the motors on its own");
        driveSent = null;
        return;
    }

    if (!armCommand("drive/" + drivePower.left + "/" + drivePower.right, "drive", true)) {
        driveSent = null;
        return;
    }

    driveSent = { left: drivePower.left, right: drivePower.right };
    driveSentAt = Date.now();
    driveNote("");
}

function driveMoveStick(x, y) {
    driveX = x;
    driveY = y;
    driveAccX += x;
    driveAccY += y;
    ++driveAccN;
    drivePaintKnob();
}

function drivePointerAt(pad, clientX, clientY) {
    var box = pad.getBoundingClientRect();
    driveMoveStick(driveClamp1((((clientX - box.left) / box.width) * 2) - 1),
                   -driveClamp1((((clientY - box.top) / box.height) * 2) - 1));
}

function driveBindPad() {
    var pad = document.getElementById("drivepad");
    if (!pad) return;

    pad.addEventListener("pointerdown", function (event) {
        pad.setPointerCapture(event.pointerId);
        driveDragging = true;
        pad.classList.add("dragging");
        pad.focus();
        drivePointerAt(pad, event.clientX, event.clientY);
        event.preventDefault();
    });

    pad.addEventListener("pointermove", function (event) {
        if (!driveDragging) return;
        drivePointerAt(pad, event.clientX, event.clientY);
        event.preventDefault();
    });

    var letGo = function (event) {
        if (!driveDragging) return;
        driveCentre(true);
        if (event) event.preventDefault();
    };

    pad.addEventListener("pointerup", letGo);
    pad.addEventListener("pointercancel", letGo);
    pad.addEventListener("lostpointercapture", letGo);
}

var DRIVE_ARROWS = {
    arrowup: "up", arrowdown: "down", arrowleft: "left", arrowright: "right",
};

function driveKeysLive() {
    if (!reachVisible()) return "";
    return driveVisible() ? "pad" : "reach";
}

function driveApplyKeys() {
    if (driveDragging) return;

    var x = 0, y = 0;

    if (driveHeld.up) y += 1;
    if (driveHeld.down) y -= 1;
    if (driveHeld.right) x += 1;
    if (driveHeld.left) x -= 1;

    if ((x === 0) && (y === 0)) {
        driveCentre(true);
        return;
    }

    var m = Math.sqrt((x * x) + (y * y)) / driveKeyThrow();
    driveMoveStick(x / m, y / m);
}

document.addEventListener("keydown", function (event) {
    var where = driveKeysLive();
    if (!where) return;

    var tag = (event.target && event.target.tagName) ? event.target.tagName.toLowerCase() : "";
    if ((tag === "input") || (tag === "select") || (tag === "textarea")) return;

    var key = event.key.toLowerCase();

    if (key === " ") {
        driveStop();
        event.preventDefault();
        return;
    }

    if ((key === "[") || (key === "]")) {
        driveNudgePower((key === "]") ? 1 : -1);
        event.preventDefault();
        return;
    }

    var direction = DRIVE_ARROWS[key];
    if (!direction) return;

    event.preventDefault();

    if (!driveHeld[direction]) {
        driveHeld[direction] = true;
        driveApplyKeys();
    }
});

document.addEventListener("keyup", function (event) {
    var direction = DRIVE_ARROWS[event.key.toLowerCase()];
    if (!direction || !driveHeld[direction]) return;

    delete driveHeld[direction];
    driveApplyKeys();
});

var driveWasOn = "";

function driveTick() {
    var where = driveKeysLive();

    if (!where || (where !== driveWasOn)) {
        driveWasOn = where;

        if (driveDragging || drivePower.left || drivePower.right
            || Object.keys(driveHeld).length) {
            driveHeld = {};
            driveCentre(true);
        }

        if (!where) return;
    }

    gpDrive();

    if (where !== "pad") {
        var stick = driveDeadzone(driveX, driveY);

        drivePower = driveMix(stick.x, stick.y);
        driveSend(false);
        return;
    }

    driveSizePad();

    driveAccX += driveX;
    driveAccY += driveY;
    ++driveAccN;

    var averageX = driveAccX / driveAccN;
    var averageY = driveAccY / driveAccN;
    driveAccX = 0;
    driveAccY = 0;
    driveAccN = 0;

    var stick = driveDeadzone(averageX, averageY);
    drivePaintPuck(stick.speed, stick.live);
    drivePower = driveMix(stick.x, stick.y);
    drivePaintPower();
    driveSend(false);
}

window.addEventListener("pagehide", function () {
    if (drivePower.left || drivePower.right) armCommand("drive/0/0", "drive", true);
});

window.addEventListener("resize", function () { driveSizePad(); driveKeepInside(); });

document.addEventListener("DOMContentLoaded", function () {
    driveBindPad();
    driveBindPanel();
    driveSizePad();
    drivePaintPower();
    driveLoadFlip();
    driveTimer = setInterval(driveTick, DRIVE_SEND_MS);
});
