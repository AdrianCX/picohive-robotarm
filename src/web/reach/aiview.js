const AI_FAST_MS = 400;
const AI_SLOW_MS = 2000;
var aiSeen = 0;
var aiRunning = false;
var aiPollTimer = null;
var aiWaitLine = null;
var aiWaitFrom = 0;
var aiSentMs = 0;
var aiAsked = false;

const AI_SAID = {
    status: "the arm's state",
    where: "where the arm is",
    poses: "the saved poses",
    poses_where: "pose data",
    pose: "a saved pose",
    pose_describe: "a pose's description",
    reach: "move the jaws to a point",
    joints: "set every joint",
    move: "move a joint",
    jog: "nudge a joint",
    home: "go home",
    stop: "stop",
};

function aiSaid(name) {
    return AI_SAID[name.replace(/\//g, "_")] || name;
}

function aiTerm() { return document.getElementById("ai-term"); }

function aiLine(text, kind) {
    var term = aiTerm();
    if (!term) return null;

    var following = (term.scrollTop + term.clientHeight) >= (term.scrollHeight - 8);

    var line = document.createElement("div");
    line.className = kind || "";
    line.textContent = text;
    term.appendChild(line);

    while (term.children.length > 300) term.removeChild(term.firstChild);

    if (following) term.scrollTop = term.scrollHeight;
    return line;
}

function aiStopWaiting(ms) {
    if (!aiWaitLine) return;

    aiWaitLine.classList.remove("aiwait");
    if (ms !== undefined) aiWaitLine.textContent = "OpenAI took " + ((ms - aiSentMs) / 1000).toFixed(1) + " s";
    aiWaitLine = null;
}

function aiTickWait() {
    if (!aiWaitLine) return;
    aiWaitLine.textContent = "waiting for OpenAI's reply… "
                           + ((Date.now() - aiWaitFrom) / 1000).toFixed(1) + " s";
}

function aiShow(ms, word, rest) {
    aiStopWaiting(ms);

    var parts = rest.split(" ");

    if (word === "ask") aiLine("> " + rest, "aiyou");
    else if (word === "create") aiLine("pico → OpenAI: starting a conversation", "aiout");
    else if (word === "context") {
        aiLine("pico: reading " + parts[0].split(",").filter(Boolean).map(aiSaid).join(", ")
               + " to send with it", "airun");
    }
    else if (word === "send") {
        var kb = (parseInt(parts[1], 10) / 1024).toFixed(1);
        aiLine("pico → OpenAI: request sent" + ((parts[0] !== "1") ? (", round " + parts[0]) : "")
               + " (" + kb + " kB)", "aiout");

        aiWaitLine = aiLine("", "aiwait");
        aiWaitFrom = Date.now();
        aiSentMs = ms;
        aiTickWait();
    }
    else if (word === "calls") {
        var asked = rest.substring(rest.indexOf(" ") + 1).split(/\),\s*/).map(function (call) {
            var open = call.indexOf("(");
            var name = (open < 0) ? call : call.substring(0, open);
            var args = (open < 0) ? "" : call.substring(open + 1).replace(/\)$/, "").replace(/^\/+/, "");
            return aiSaid(name) + (args ? (" (" + args + ")") : "");
        });

        aiLine("OpenAI → pico: asks for " + asked.join(", "), "aiin");
    }
    else if (word === "call") {
        if (parts[1] === "refused") aiLine("  pico: refused " + parts[0] + " - not a tool it may use", "aibad");
        else aiLine("  pico: ran " + parts[0] + ", " + parts[1] + " bytes back", "airun");
    }
    else if (word === "plan") {
        aiLine("OpenAI → pico: final command list, " + parts[0] + " steps, about "
               + (parseInt(parts[1], 10) / 1000).toFixed(1) + " s", "aiin");
    }
    else if (word === "step") aiLine("  step " + parts[0] + "  " + parts.slice(1).join(" "), "airun");
    else if (word === "plandone") aiLine("done: the arm finished the plan", "aiend");
    else if (word === "planstop") aiLine("stopped at step " + parts[0], "aibad");
    else if (word === "end") {
        if (!/^running \d+ steps/.test(rest)) {
            var bad = /^(stopped|OpenAI did not|OpenAI's answer|the question|the next question|not started)/.test(rest);
            aiLine((bad ? "" : "OpenAI: ") + rest, bad ? "aibad" : "aiend");
        }
    }
    else aiLine(word + " " + rest);
}

function aiTakeEvents(body) {
    var lines = body.split("\n");
    var head = lines[0].split(" ");
    var newest = parseInt(head[1], 10) || 0;

    if (newest < aiSeen) {
        aiLine("--- the board restarted ---", "aibad");
        aiSeen = 0;
    }

    for (var i = 1; i < lines.length; ++i) {
        var match = /^(\d+) (\d+) (\S+) ?(.*)$/.exec(lines[i]);
        if (!match) continue;

        var n = parseInt(match[1], 10);
        if (n <= aiSeen) continue;

        if (aiSeen && (n > aiSeen + 1)) aiLine("…", "aiwait");
        aiSeen = n;
        aiShow(parseInt(match[2], 10), match[3], match[4]);
    }

    aiSeen = Math.max(aiSeen, newest);

    var wasRunning = aiRunning;
    aiRunning = (head[0] === "running");
    if (!aiRunning) aiStopWaiting();
    if (wasRunning && !aiRunning) aiAsked = false;

    aiSchedule();
}

function aiPollNow() {
    clearTimeout(aiPollTimer);
    aiPollTimer = null;

    if (!handler || !handler.ws || (handler.ws.readyState !== WebSocket.OPEN)) {
        aiSchedule();
        return;
    }

    armCommand("ai/events/" + aiSeen, "ai/events", true);
}

function aiSchedule() {
    clearTimeout(aiPollTimer);
    aiPollTimer = null;

    var open = armAiShown && reachVisible();
    if (!open && !aiRunning && !aiAsked) return;

    aiPollTimer = setTimeout(aiPollNow, (aiRunning || aiAsked) ? AI_FAST_MS : AI_SLOW_MS);
}

function aiViewOpened() {
    var box = document.getElementById("ai-text");
    if (box) box.focus();
    aiPollNow();
}

function aiViewAsk() {
    var box = document.getElementById("ai-text");
    var text = box ? box.value.trim() : "";
    if (!text) return;

    if (!handler || !handler.send(new Blob(["/rc/ai", "\0", text]), "ai", true, false)) {
        aiLine("no link to the pico, so nothing was asked", "aibad");
        return;
    }

    box.value = "";
    aiAsked = true;
    aiPollNow();
}

function aiViewStop() {
    armCommand("ai/stop", "ai/stop", true);
    aiAsked = true;
    aiPollNow();
}

function aiViewKey(event) {
    if (event.key === "Enter") {
        aiViewAsk();
        event.preventDefault();
    }

    event.stopPropagation();
}

onMessage("/rc/ai/events", aiTakeEvents);

onMessage("/rc/ai", function (body) {
    if (/^(not started|no memory|ai what)/.test(body)) {
        aiLine(body, "aibad");
        aiAsked = false;
    }
});

onMessage("/rc/ai/stop", function (body) {
    if (body !== "stopped") aiLine(body, "aiwait");
});

document.addEventListener("DOMContentLoaded", function () {
    setInterval(aiTickWait, 100);
});
