// Client-side logic for Space Mission Simulator
let socket;
let user = {};
let missionRoles = {};
let missionTeams = [];
let missionId = 'default';

// Elements
const joinSection = document.getElementById('join-section');
const joinForm = document.getElementById('join-form');
const nameInput = document.getElementById('name');
const teamInput = document.getElementById('team');
const roleInput = document.getElementById('role');
const missionIdInput = document.getElementById('mission-id');
const gameSection = document.getElementById('game-section');
const userInfo = document.getElementById('user-info');
const readyBtn = document.getElementById('ready-btn');
const stateInd = document.getElementById('state-indicator');
const userList = document.getElementById('user-list');
const timelineList = document.getElementById('timeline-list');
const tasksList = document.getElementById('tasks-list');
const chatHistory = document.getElementById('chat-history');
const chatForm = document.getElementById('chat-form');
const chatMsg = document.getElementById('chat-msg');
const chatChannel = document.getElementById('chat-channel');
const emergencyPanel = document.getElementById('emergency-panel');

// Mission Complete Effects
function showMissionCompleteEffects() {
    // Prevent duplicate overlays
    if (document.getElementById('mission-complete-effects')) return;
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'mission-complete-effects';
    overlay.id = 'mission-complete-effects';
    document.body.appendChild(overlay);
    // Banner
    const banner = document.createElement('div');
    banner.className = 'mission-complete-banner';
    banner.textContent = '\uD83D\uDE80 Mission Complete! \uD83C\uDF89';
    overlay.appendChild(banner);

    // Confetti!
    const colors = [
        '#31e3ac','#ffd663','#ff95ca','#62d1fb','#f7797d',
        '#ffcb63','#baf2ff','#98fa63','#fff6da','#f9a826'
    ];
    for (let i = 0; i < 50; ++i) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti-piece';
        confetti.style.background = colors[Math.floor(Math.random()*colors.length)];
        confetti.style.left = Math.random() * 98 + 'vw';
        confetti.style.top = '-18px';
        confetti.style.transform =
            `rotateZ(${Math.random()*360}deg) scale(${0.7 + Math.random()*0.7})`;
        confetti.style.animationDelay = (Math.random()*0.8).toFixed(2)+'s';
        overlay.appendChild(confetti);
    }
    setTimeout(()=>{
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 4400);
}

window.addEventListener('DOMContentLoaded', () => {
    // Reset the selects
    resetTeamAndRoleDropdowns();
    fetch('/mission_meta')
        .then(res => res.json())
        .then(data => {
            missionRoles = data.roles;
            missionTeams = data.teams;
            fillTeamsDropdown(missionTeams);
        });
});

function resetTeamAndRoleDropdowns() {
    // TEAM
    teamInput.innerHTML = '<option value="" disabled selected>Please select a team</option>';
    // ROLE
    roleInput.innerHTML = '<option value="" disabled selected>Please select a role</option>';
    roleInput.disabled = true;
}

function fillTeamsDropdown(teams) {
    resetTeamAndRoleDropdowns();
    teams.forEach(t => {
        let opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        teamInput.appendChild(opt);
    });
}

function fillRolesDropdown(team, roles) {
    if (!team || !roles || !roles[team]) {
        roleInput.innerHTML = '<option value="" disabled selected>Please select a role</option>';
        roleInput.disabled = true;
        return;
    }
    roleInput.innerHTML = '<option value="" disabled selected>Please select a role</option>';
    roles[team].forEach(role => {
        let opt = document.createElement('option');
        opt.value = role;
        opt.textContent = role;
        roleInput.appendChild(opt);
    });
    roleInput.disabled = false;
}

teamInput.addEventListener('change', function() {
    const selectedTeam = this.value;
    fillRolesDropdown(selectedTeam, missionRoles);
});

joinForm.onsubmit = function(e) {
    e.preventDefault();
    if (!nameInput.value.trim() || !teamInput.value || !roleInput.value) return;
    user.name = nameInput.value.trim();
    user.team = teamInput.value;
    user.role = roleInput.value;
    missionId = missionIdInput.value.trim() || 'default';
    joinSection.style.display = 'none';
    connectToServer();
};

function connectToServer() {
    let reconnectAttempts = 0;
    function establishWebSocket() {
        socket = new WebSocket(`ws://${window.location.host}`);
        socket.onopen = () => {
            reconnectAttempts = 0;
            socket.send(JSON.stringify({
                type: 'join',
                missionId,
                name: user.name,
                team: user.team,
                role: user.role
            }));
        };
        socket.onmessage = (ev) => {
            let msg;
            try { msg = JSON.parse(ev.data); } catch { return; }
            if (msg.type === 'joined') {
                user.id = msg.user.id;
                gameSection.style.display = '';
                userInfo.textContent = `${user.name} (${user.team} - ${user.role})`;
            } else if (msg.type === 'user_list') {
                renderUserList(msg.users);
            } else if (msg.type === 'sync') {
                // Always accept and apply "sync" as canonical state
                if (msg.roles && typeof msg.roles === 'object') {
                    missionRoles = msg.roles;
                }
                if (Array.isArray(msg.teams) && msg.teams.length) {
                    missionTeams = msg.teams;
                }
                if (msg.timeline) {
                    latestTimeline = msg.timeline;
                }
                renderTimeline(msg.timeline, {});
                renderTasks(msg.timeline, msg.state);
                renderEventPanel(msg.events);
                stateInd.textContent = msg.state === 'lobby' ? 'Lobby' : (msg.state === 'running' ? 'Mission Running' : 'Mission Ended');
            } else if (msg.type === 'mission_start') {
                stateInd.textContent = 'Mission Running';
                renderTasks();
                // After mission start, request a sync just in case
                requestFullSync();
            } else if (msg.type === 'progress') {
                if (msg.timeline) {
                    latestTimeline = msg.timeline;
                }
                renderTimeline(msg.timeline || null, msg.progress);
                renderTasks(msg.timeline||undefined);
                // Robust: also always request a sync after deltas
                requestFullSync();
            } else if (msg.type === 'stage_complete') {
                if (msg.timeline) {
                    latestTimeline = msg.timeline;
                }
                renderTimeline(msg.timeline || null, null);
                renderTasks(msg.timeline||undefined);
                // Robust: also always request a sync after deltas
                requestFullSync();
            } else if (msg.type === 'emergency') {
                renderEventPanel([msg.event]);
            } else if (msg.type === 'mission_end') {
                stateInd.textContent = 'Mission Complete!';
                renderTasks();
                renderEventPanel(null, true);
                showMissionCompleteEffects();
                // After mission end, request a sync to finalize state
                requestFullSync();
            } else if (msg.type === 'chat') {
                appendChat(msg.chat);
            }
        };
        socket.onclose = () => {
            // Attempt reconnect after brief delay (capped at 10s)
            setTimeout(() => {
                reconnectAttempts++;
                establishWebSocket();
            }, Math.min(2000 * reconnectAttempts, 10000));
            // Allow user to rejoin the lobby by resetting state
            user = {};
            missionId = 'default';
            gameSection.style.display = 'none';
            joinSection.style.display = '';
            nameInput.value = '';
            fillTeamsDropdown(missionTeams);
        };
    }
    establishWebSocket();
}

function requestFullSync() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'request_sync' }));
    }
}

function renderUserList(users) {
    userList.innerHTML = '';
    users.forEach(u => {
        const li = document.createElement('li');
        li.textContent = `${u.name} (${u.role})${u.ready ? ' \u2705' : ''}`;
        userList.appendChild(li);
    });
}

readyBtn.onclick = function() {
    socket.send(JSON.stringify({ type: 'user_ready' }));
    readyBtn.disabled = true;
    readyBtn.textContent = 'Ready \u2705';
};

let latestTimeline = null;
function renderTimeline(provided, progress) {
    if (!(provided || latestTimeline)) return;
    const timeline = provided || latestTimeline;
    if (provided) latestTimeline = timeline;
    timelineList.innerHTML = '';
    timeline.forEach((stage, i) => {
        const li = document.createElement('li');
        li.textContent = stage.name + (stage.complete ? ' \u2705' : '');
        if (stage.complete) li.classList.add('complete');
        timelineList.appendChild(li);
    });
}

function renderTasks(timeline, state) {
    tasksList.innerHTML = '';
    timeline = timeline || latestTimeline;
    if (!timeline || !user.role) return;
    // Find first incomplete stage
    let current = timeline.find((s) => !s.complete);
    if (!current) {
        tasksList.innerHTML = '<li><em>All mission tasks complete!</em></li>';
        return;
    }
    // Find role's tasks
    let roleTask = current.tasks[user.role];
    if (!roleTask) {
        tasksList.innerHTML = '<li><em>No active tasks for your role at this stage.</em></li>';
        return;
    }
    // Create task elements
    const li = document.createElement('li');
    li.textContent = roleTask.description;
    const btn = document.createElement('button');
    btn.textContent = 'Complete Task';
    btn.onclick = () => {
        btn.disabled = true;
        socket.send(JSON.stringify({ type: 'task_update', stageIdx: timeline.indexOf(current), role: user.role, done: true }));
        // After any action, request sync for robustness
        requestFullSync();
    };
    // Prevent double-submit/show done if done
    const done = current.tasksDone && current.tasksDone[user.role];
    if (done) {
        btn.disabled = true;
        btn.textContent = 'Task Complete!';
    } else if (stateInd.textContent === 'Mission Complete!') {
        btn.disabled = true;
        btn.textContent = 'Mission Ended';
    }
    li.appendChild(btn);
    tasksList.appendChild(li);
}

// --- Chat/Comms ---
chatForm.onsubmit = function(e) {
    e.preventDefault();
    socket.send(JSON.stringify({
        type: 'chat',
        msg: chatMsg.value.slice(0,200),
        channel: chatChannel.value
    }));
    chatMsg.value = '';
};

function appendChat(message) {
    const div = document.createElement('div');
    div.innerHTML = `<span style=\"color:#ffcb63;\">${message.user}:</span> ${message.msg}`;
    chatHistory.appendChild(div);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

// --- Emergencies/Event display ---
function renderEventPanel(events, hide) {
    if (hide) {
        emergencyPanel.style.display = 'none';
        return;
    }
    events = events || [];
    if (!events.length) {
        emergencyPanel.style.display = 'none';
        return;
    }
    emergencyPanel.innerHTML = `<strong>\u26a0\ufe0f Emergency!</strong><br>${events.map(ev => ev.name + ': ' + ev.desc).join('<br>')}`;
    emergencyPanel.style.display = '';
}
