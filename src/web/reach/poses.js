const POSE_POLL_MS = 1000;

var poseState = { poses: [], max: 0, going: "" };
var poseShape = "";
var posePollTimer = null;
var poseShown = "";

function posesVisible() {
    return armPosesShown && reachVisible();
}

var poseEditing = "";

function poseNameBox() {
    var box = document.getElementById("pose-name");
    return box ? box.value.trim() : "";
}

function poseSaveBox(show, editing) {
    var box = document.getElementById("pose-savebox");
    if (!box) return;

    box.hidden = !show;
    if (!show) return;

    var pose = editing ? poseNamed(editing) : null;
    poseEditing = pose ? editing : "";

    document.getElementById("pose-boxtitle").textContent = poseEditing ? ("Edit " + poseEditing) : "Save position";
    document.getElementById("pose-boxhint").textContent = poseEditing
        ? "What it is, for people and for OpenAI. Empty clears it."
        : "Where the arm is now. The same name again writes over it.";

    var name = document.getElementById("pose-name");
    var desc = document.getElementById("pose-desc");

    name.hidden = !!poseEditing;
    name.value = "";
    desc.value = pose ? (pose.d || "") : "";

    posePaint();
    (poseEditing ? desc : name).focus();
}

function poseSaveKey(event) {
    if (event.key === "Enter") poseSave();
    else if (event.key === "Escape") poseSaveBox(false);
    else return;

    event.preventDefault();
    event.stopPropagation();
}

function poseNote(text) {
    var note = document.getElementById("pose-note");
    if (note) note.textContent = text;
}

function poseRefresh() { armCommand("poses", "poses", true); }

function poseNamed(name) {
    return ((poseState && poseState.poses) || []).find(function (p) { return p.n === name; }) || null;
}

function poseShow(name) {
    poseShown = (poseShown === name) ? "" : (name || "");

    if (poseShown && !reachSavedAngles(poseNamed(poseShown))) {
        poseNote(reachZero ? (poseShown + " does not hold the four joints that place the arm")
                           : "the model is not mapped to the arm yet (3D mapping), so it cannot be drawn");
        poseShown = "";
    }

    posePaint();
    reachPaint();
}

function poseSave() {
    var desc = document.getElementById("pose-desc");
    var text = desc ? desc.value.trim() : "";

    if (poseEditing) {
        armCommand("pose/describe/" + poseEditing + "/" + (text || "-"), "Describe " + poseEditing);
    }
    else {
        var name = poseNameBox();

        if (!/^[A-Za-z0-9_-]{1,15}$/.test(name)) {
            poseNote("a name is 1 to 15 letters, digits, - or _");
            return;
        }

        if (!armCommand("pose/save/" + name, "Save " + name)) return;
        if (text) armCommand("pose/describe/" + name + "/" + text, "Describe " + name);
    }

    poseSaveBox(false);
    setTimeout(poseRefresh, 500);
}

function poseLoad(name) { armCommand("pose/load/" + name, "Go to " + name); }

function poseDelete(name) {
    if (!confirm("Delete the pose \"" + name + "\"?")) return;
    armCommand("pose/delete/" + name, "Delete " + name);
}

function poseHtml(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function poseShapeOf(state) {
    return state.poses.map(function (p) { return p.n + ":" + p.joints + ":" + (p.d || ""); }).join("|") + "/" + state.max;
}

function poseRender(state) {
    poseState = state;

    var shape = poseShapeOf(state);
    if (shape !== poseShape) {
        poseShape = shape;
        poseBuild(state);
    }

    posePaint();
}

function poseBuild(state) {
    var box = document.getElementById("pose-list");
    if (!box) return;

    if (!state.poses.length) {
        box.innerHTML = '<div class="armkeys">No poses yet. Put the arm where you want it, '
                      + 'then give it a name up there and save it.</div>';
        return;
    }

    var html = "";

    for (var n = 0; n < state.poses.length; ++n) {
        var name = state.poses[n].n;

        html += '<div class="armrow poserow" id="poserow' + n + '">';
        html += '<span class="armname" title="' + poseHtml(state.poses[n].d || name) + '">' + name + '</span>';
        html += '<button type="button" id="poseshow' + n + '" onclick="poseShow(\'' + name + '\')"'
              + ' title="draw it as the yellow arm">Show</button>';
        html += '<button type="button" onclick="poseLoad(\'' + name + '\')">Go</button>';
        html += '<button type="button" onclick="poseSaveBox(true, \'' + name + '\')"'
              + ' title="what it is">Edit</button>';
        html += '<button type="button" onclick="poseDelete(\'' + name + '\')" title="delete">&times;</button>';
        html += '</div>';
    }

    box.innerHTML = html;
}

function posePaint() {
    var state = poseState;
    var picked = poseNameBox();

    for (var n = 0; n < state.poses.length; ++n) {
        var show = document.getElementById("poseshow" + n);
        if (show) show.classList.toggle("reachon", poseShown === state.poses[n].n);
    }

    var save = document.getElementById("pose-save");
    if (save) {
        var known = state.poses.some(function (p) { return p.n === picked; });
        save.textContent = (picked && known) ? "Save over" : "Save";
    }

    if (state.going) {
        poseNote("going to " + state.going);
    }
    else if (state.poses.length >= state.max) {
        poseNote("full: " + state.max + " poses, delete one to save another");
    }
}

function posePoll() {
    if (!posesVisible()) return;

    poseRefresh();
}

document.addEventListener("DOMContentLoaded", function () {
    posePollTimer = setInterval(posePoll, POSE_POLL_MS);
});
