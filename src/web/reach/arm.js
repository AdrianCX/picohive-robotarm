const ARM_HOLD_MS = 900;
const ARM_FLUSH_MS = 40;
const ARM_LOST_MS = 800;
var armState = [];
var armStrays = [];
var armSpare = 0;
var armConflicts = [];
var armShape = "";
var armPicked = 0;
var armHoldUntil = {};
var armMenuShown = false;
var armMapShown = false;
var armPosesShown = false;
var armAiShown = false;
var armFlushTimer = null;

var armQueue = {};
var armSentAt = 0;
var armLastReply = "";

function armMenu(show) {
    armMenuShown = (show === undefined) ? !armMenuShown : !!show;
    if (armMenuShown) armMenusClosedBut("calibration");

    armPaintMenus();
    if (armMenuShown) armCommand("state", "state", true);
}

function armMapMenu(show) {
    armMapShown = (show === undefined) ? !armMapShown : !!show;
    if (armMapShown) armMenusClosedBut("map");

    if (!armMapShown && (typeof reachMapClose === "function")) reachMapClose();

    armPaintMenus();
    if (armMapShown) armCommand("state", "state", true);
}

function armPosesMenu(show) {
    armPosesShown = (show === undefined) ? !armPosesShown : !!show;
    if (armPosesShown) armMenusClosedBut("poses");
    else if (poseShown) poseShow("");

    if (!armPosesShown) poseSaveBox(false);

    armPaintMenus();
    if (armPosesShown) poseRefresh();
}

function armAiMenu(show) {
    armAiShown = (show === undefined) ? !armAiShown : !!show;
    if (armAiShown) armMenusClosedBut("ai");

    armPaintMenus();
    if (armAiShown) aiViewOpened();
}

function armMenusClosedBut(which) {
    if (which !== "calibration") armMenuShown = false;
    if (which !== "ai") armAiShown = false;
    if ((which !== "poses") && armPosesShown) {
        armPosesShown = false;
        if (poseShown) poseShow("");
        poseSaveBox(false);
    }

    if ((which !== "map") && armMapShown) {
        armMapShown = false;
        if (typeof reachMapClose === "function") reachMapClose();
    }
}

function armPaintMenus() {
    var menus = [["arm-menu", "arm-menubtn", armMenuShown], ["arm-map", "arm-mapbtn", armMapShown],
                 ["arm-poses", "arm-posesbtn", armPosesShown], ["arm-ai", "arm-aibtn", armAiShown]];

    for (var m = 0; m < menus.length; ++m) {
        var menu = document.getElementById(menus[m][0]);
        if (menu) menu.hidden = !menus[m][2];

        var button = document.getElementById(menus[m][1]);
        if (button) button.classList.toggle("reachon", menus[m][2]);
    }

    var stage = document.getElementById("reach-stage");
    if (stage) {
        stage.classList.toggle("armnarrow", armPosesShown || armMapShown);
        stage.classList.toggle("armai", armAiShown);
    }
}

function armProblems() {
    var none = [], open = [], caling = [], shared = [];

    for (var i = 0; i < armState.length; ++i) {
        var j = armState[i];

        if (armConflicts.indexOf(j.id) >= 0) shared.push(j.n);
        else if (!j.here) none.push(j.n);
        else if (j.caling) caling.push(j.n);
        else if (!j.cal) open.push(j.n);
    }

    var said = [];
    if (open.length) said.push("not calibrated: " + open.join(", "));
    if (caling.length) said.push("calibrating: " + caling.join(", "));
    if (none.length) said.push("no servo: " + none.join(", "));
    if (shared.length) said.push("shared id: " + shared.join(", "));

    return said.join(" \u00B7 ");
}

function armPaintWarning() {
    var problems = armState.length ? armProblems() : "";

    var button = document.getElementById("arm-menubtn");
    if (button) button.classList.toggle("reachalert", !!problems);

    var warn = document.getElementById("arm-warn");
    if (warn) {
        warn.hidden = !problems;
        warn.textContent = problems ? "\u26A0 " + problems : "";
    }
}

function armCommand(command, label, quiet) {
    if (!handler) return false;
    return handler.send(new Blob(["/rc/" + command]), label || command, quiet === true, false);
}

function armOnMessage(topic, body) {
    if (topic === "/rc/poses") {
        try { poseRender(JSON.parse(body)); } catch (e) { console.log("bad poses: ", e); }
        return true;
    }

    if (topic === "/rc/pose") {
        poseNote(body);
        poseRefresh();
        return false;
    }

    if (topic === "/rc/calib") {
        try { reachStep("calibration", function () { reachTakeCalibration(JSON.parse(body)); }); }
        catch (e) { console.log("bad calib: ", e); }

        return true;
    }

    if (topic === "/rc/state") {
        var state = null;

        try { state = JSON.parse(body); }
        catch (e) { console.log("bad state: ", e); return true; }

        reachStateAt = Date.now();

        try { armRender(state); }
        catch (e) { reachLastError = "state: " + String((e && e.message) || e); console.log(e); }

        if (reachOneShot) reachStep("calibrate", reachTakeForward);
        else if (reachWaiting >= 0) reachStep("capture", reachTakeCapture);

        return true;
    }

    if ((topic === "/rc/step") || (topic === "/rc/jog") || (topic === "/rc/move")) {
        armLastReply = body;
        armSentAt = 0;
        armFlush();
        armPaintNote();
        return true;
    }

    return false;
}

function armNote(text) {
    var note = document.getElementById("arm-note");
    if (note) note.textContent = text;
}

function armBusy() {
    if (armSentAt) return true;

    for (var i in armQueue) {
        if (armQueue[i] && ((armQueue[i].step !== null) || armQueue[i].jog)) return true;
    }

    return false;
}

function armPaintNote() {
    armNote(armBusy() ? "moving\u2026" : armLastReply);
}

function armDegrees(deci) {
    var sign = (deci < 0) ? "-" : "";
    var whole = Math.floor(Math.abs(deci) / 10);
    var tenth = Math.abs(deci) % 10;
    return sign + whole + "." + tenth + "°";
}

function armShapeOf(joints) {
    return joints.map(function (j) {
        return [j.n, j.id, j.here, j.cal, j.caling, j.min, j.max].join(":");
    }).join("|") + "!" + armStrays.join(",") + "!" + armSpare + "!" + armConflicts.join(",");
}

function armRender(state) {
    var joints = state.joints || [];
    armState = joints;
    armStrays = state.strays || [];
    armSpare = state.spare || 0;
    armConflicts = state.conflicts || [];

    var shape = armShapeOf(joints);
    if (shape !== armShape) {
        armShape = shape;
        armBuild(joints);
    }

    for (var i = 0; i < joints.length; ++i) {
        armUpdate(i, joints[i]);
    }

    armPaintWarning();
}

function armIdTargets(mine) {
    var targets = [];

    for (var k = 0; k < armState.length; ++k) {
        if (!armState[k].here && (armState[k].id !== mine)) {
            targets.push({ id: armState[k].id, what: armState[k].n });
        }
    }

    if (armSpare) targets.push({ id: armSpare, what: "no joint — park it here" });

    return targets;
}

function armIdMoveRow(i, j) {
    var targets = armIdTargets(j.id);

    if (!targets.length) {
        return '<div class="armtele">This servo is id ' + j.id + '. There is no free id to move it'
             + ' to: every joint has a servo, so unplug the one whose place this is meant to take'
             + ' and scan again.</div>';
    }

    var html = '<div class="armctl armidmove">';
    html += '<span class="armid">servo id ' + j.id + ' becomes</span>';
    html += '<select id="armidto' + i + '">';

    for (var t = 0; t < targets.length; ++t) {
        html += '<option value="' + targets[t].id + '">id ' + targets[t].id
             + ' &mdash; ' + targets[t].what + '</option>';
    }

    html += '</select>';
    html += '<button type="button" onclick="armMoveId(' + i + ')"';
    html += ' title="writes the new id into this servo\'s own memory; it stops being this joint,'
         + ' and this calibration is dropped">Change id</button>';
    html += '</div>';

    return html;
}

function armBuild(joints) {
    var box = document.getElementById("arm-joints");
    if (!box) return;

    if (!joints.length) {
        box.innerHTML = "<p>No answer from the firmware yet.</p>";
        return;
    }

    var html = "";

    for (var i = 0; i < joints.length; ++i) {
        var j = joints[i];
        var dead = j.here ? "" : " armdead";

        html += '<div class="armrow' + dead + '" id="armrow' + i + '">';
        html += '<div class="armhead">';
        html += '<span class="armname">' + j.n + '</span>';
        html += '<span class="armid">id ' + j.id + '</span>';
        html += '<span class="armstat" id="armtele' + i + '"></span>';
        html += '<span class="armangle" id="armangle' + i + '"></span>';
        html += '</div>';

        if (j.here && (armConflicts.indexOf(j.id) >= 0)) {
            html += '<div class="armwarn">something else answers to id ' + j.id + ' as well'
                 + ' &mdash; probably a second servo on it, which nothing can talk to while they'
                 + ' share an id. Unplug it, or give it one of its own with only it on the bus.</div>';
        }

        if (!j.here) {
            if (armConflicts.indexOf(j.id) >= 0) {
                html += '<div class="armwarn">id ' + j.id + ' answers, but not with an answer'
                     + ' &mdash; most likely two servos both on id ' + j.id + '. A servo out of the'
                     + ' bag is id 1, like this arm\'s first joint, and two on one id cannot be told'
                     + ' apart or renamed. Unplug until one of them is left, scan, give that one an'
                     + ' id, then plug the rest back in. The log says which it is.</div>';
            }
            else {
                html += '<div class="armwarn">no servo answers to id ' + j.id
                     + ' &mdash; plug one in and press Scan</div>';
            }

            html += '<div class="armctl">';
            html += '<button type="button" onclick="armCommand(\'scan\', \'Scan the bus\')">Scan</button>';

            for (var s = 0; s < armStrays.length; ++s) {
                if (armConflicts.indexOf(armStrays[s]) >= 0) continue;

                html += '<button type="button" onclick="armSetId(' + armStrays[s] + ', ' + j.id + ', \'' + j.n + '\')"';
                html += ' title="writes id ' + j.id + ' into that servo\'s own memory, and then it is this joint">';
                html += 'Make id ' + armStrays[s] + ' this joint</button>';
            }

            html += '</div>';

            if (armStrays.length) {
                html += '<div class="armtele">id ' + armStrays.join(", id ")
                     + (armStrays.length > 1
                          ? " answer and are nobody's joint. Whichever you pick becomes id "
                          : " answers and is nobody's joint. It becomes id ")
                     + j.id + ', and then it needs calibrating like any other.</div>';
            }
        }
        else if (j.caling) {
            html += '<div class="armwarn" id="armseen' + i + '">move it gently to both ends of where it may go</div>';
            html += '<div class="armctl">';
            html += '<button type="button" onclick="armCalibrate(' + i + ', \'finish\')">Save these limits</button>';
            html += '<button type="button" onclick="armCalibrate(' + i + ', \'center\')" title="for a joint whose travel crosses the servo\'s 0 point: ends this calibration and starts over from here">Middle is here</button>';
            html += '<button type="button" onclick="armCalibrate(' + i + ', \'cancel\')">Cancel</button>';
            html += '</div>';

            html += armIdMoveRow(i, j);
        }
        else if (!j.cal) {
            html += '<div class="armwarn">no limits yet &mdash; it will not move until it has some</div>';
            html += '<div class="armctl">';
            html += '<button type="button" onclick="armCalibrate(' + i + ', \'start\')">Calibrate by hand</button>';
            html += '<button type="button" onclick="armCalibrate(' + i + ', \'center\')" title="for a joint whose travel crosses the servo\'s 0 point">Middle is here</button>';
            html += '</div>';
        }
        else {
            html += '<div class="armctl">';
            html += '<button type="button" onclick="armJog(' + i + ', -10)">&minus;</button>';
            html += '<input type="range" id="armslider' + i + '" min="' + j.min + '" max="' + j.max + '" value="' + j.pos + '"';
            html += ' oninput="armSlide(' + i + ', this.value)" onchange="armSlide(' + i + ', this.value)">';
            html += '<button type="button" onclick="armJog(' + i + ', 10)">+</button>';
            html += '<button type="button" onclick="armCommand(\'home/' + (i + 1) + '\', \'home\')">Home</button>';
            html += '<button type="button" onclick="armCalibrate(' + i + ', \'start\')" title="teach it its limits again">Recalibrate</button>';
            html += '</div>';
        }

        html += '</div>';
    }

    box.innerHTML = html;
}

function armUpdate(i, j) {
    var angle = document.getElementById("armangle" + i);
    if (angle) {
        angle.textContent = j.here ? (armDegrees(j.deci) + (j.moving ? " ▶" : "")) : "—";
    }

    var slider = document.getElementById("armslider" + i);
    if (slider && (Date.now() >= (armHoldUntil[i] || 0))) {
        slider.value = j.pos;
    }

    var seen = document.getElementById("armseen" + i);
    if (seen) {
        seen.textContent = j.wrapped
            ? "the travel crossed the servo's 0 point: put the joint in the middle of its travel, press \"Middle is here\", then calibrate again"
            : ("seen " + j.seenmin + " to " + j.seenmax + " of 4095 — both ends, then save");
    }

    var tele = document.getElementById("armtele" + i);
    if (tele) {
        if (!j.here) {
            tele.textContent = "";
        }
        else if (!j.seen) {
            tele.textContent = "no reading yet";
        }
        else {
            tele.textContent = j.pos + " in " + j.min + "–" + j.max
                + " · " + Math.round(j.mindeci / 10) + "…" + Math.round(j.maxdeci / 10) + "°"
                + " · load " + j.load
                + " · " + Math.floor(j.volt / 10) + "." + (j.volt % 10) + "V";
            tele.title = "step " + j.pos + " of " + j.min + "-" + j.max
                + ", " + armDegrees(j.mindeci) + " to " + armDegrees(j.maxdeci)
                + ", " + j.temp + "°C";
        }
    }
}

function armWant(i) {
    if (!armQueue[i]) armQueue[i] = { step: null, jog: 0 };
    return armQueue[i];
}

function armSlide(i, value) {
    armPicked = i;
    armHoldUntil[i] = Date.now() + ARM_HOLD_MS;

    var want = armWant(i);
    want.step = parseInt(value, 10);
    want.jog = 0;

    armFlush();
}

function armJog(i, deci) {
    armPicked = i;
    armHoldUntil[i] = Date.now() + ARM_HOLD_MS;

    var want = armWant(i);
    want.jog += deci;

    armFlush();
}

function armWaiting() {
    if (!armSentAt) return false;
    if ((Date.now() - armSentAt) < ARM_LOST_MS) return true;
    armSentAt = 0;
    return false;
}

function armFlush() {
    if (armWaiting()) return;
    if (!handler || !handler.ws || (handler.ws.readyState !== WebSocket.OPEN)) return;

    for (var n = 0; n < armState.length; ++n) {
        var i = (armPicked + n) % armState.length;
        var want = armQueue[i];

        if (!want || ((want.step === null) && !want.jog)) continue;

        var command;

        if (want.step !== null) {
            var step = want.step + Math.round((want.jog * 4096) / 3600);
            var joint = armState[i];

            if (joint) step = Math.max(joint.min, Math.min(joint.max, step));
            command = "step/" + (i + 1) + "/" + step;
        }
        else {
            command = "jog/" + (i + 1) + "/" + (want.jog / 10);
        }

        if (armCommand(command, "move", true)) {
            armQueue[i] = { step: null, jog: 0 };
            armSentAt = Date.now();
        }

        armPaintNote();
        return;
    }
}

function armSetId(from, to, joint) {
    if (!confirm("Make the servo that answers to id " + from + " the " + joint + ", id " + to + "?"
                 + "\n\nThe id is written into that servo's memory. Only one servo that is not"
                 + " already a joint should be on the bus.")) return;

    armCommand("setid/" + from + "/" + to, "Set id");
    armShape = "";
}

function armMoveId(i) {
    var joint = armState[i];
    var box = document.getElementById("armidto" + i);
    if (!joint || !box) return;

    var to = parseInt(box.value, 10);
    var label = box.options[box.selectedIndex].textContent;

    if (!confirm("Move this servo from id " + joint.id + " to " + label + "?"
                 + "\n\nThe id is written into the servo's own memory. The " + joint.n
                 + " is left with no servo, and the calibration in progress is dropped.")) return;

    armCommand("setid/" + joint.id + "/" + to, "Set id");
    armShape = "";
}

function armCalibrate(i, what) {
    var label = { start: "Calibrate", finish: "Save limits", cancel: "Cancel", center: "Set middle" }[what];
    armCommand("calibrate/" + (i + 1) + "/" + what, label);
    armShape = "";
}

onStreamedMessage("/rc/poses", function (body) { armOnMessage("/rc/poses", body); });
onStreamedMessage("/rc/poses/where", function (body) { hudToast("ok", "/rc/poses/where: " + body); });
["/rc/pose", "/rc/calib", "/rc/state", "/rc/step", "/rc/jog", "/rc/move"].forEach(function (topic) {
    onMessage(topic, function (body) {
        if (!armOnMessage(topic, body)) hudToast("ok", topic + ": " + body);
    });
});

document.addEventListener("DOMContentLoaded", function () {
    armFlushTimer = setInterval(function () { armFlush(); armPaintNote(); }, ARM_FLUSH_MS);
});
