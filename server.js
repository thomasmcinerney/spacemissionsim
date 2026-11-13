const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const missionData = require('./mission_data');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

// Expose roles and teams for early frontend population, with per-team roles
app.get('/mission_meta', (req, res) => {
    res.json({
        roles: missionData.roles,
        teams: missionData.teams,
    });
});

// Player/session storage (in-memory for now)
const sessions = {}; // { missionId: { state, users, ... } }

let clientIdCounter = 1;
function makeClientId() { return 'C' + (clientIdCounter++); }

function getOrCreateSession(missionId) {
    if (!sessions[missionId]) {
        sessions[missionId] = {
            missionId,
            users: {},    // id: { ws, name, team, role, ready }
            chat: [],     // {ts, user, msg, channel}
            timeline: JSON.parse(JSON.stringify(missionData.timeline)),
            events: [],   // Event log (emergencies, decisions)
            state: 'lobby',
            scores: {},   // Per-team/role scored
            startTime: null,
            currentStage: 0
        };
    }
    return sessions[missionId];
}

function broadcastSessionUsers(session) {
    const users = Object.values(session.users).map(u => ({ id: u.id, name: u.name, team: u.team, role: u.role, ready: u.ready }));
    Object.values(session.users).forEach(u => {
        if (u.ws.readyState === WebSocket.OPEN) {
            u.ws.send(JSON.stringify({ type: 'user_list', users }));
        }
    });
}

function broadcastToSession(session, msg) {
    Object.values(session.users).forEach(u => {
        if (u.ws.readyState === WebSocket.OPEN) {
            u.ws.send(JSON.stringify(msg));
        }
    });
}

function allCurrentSessionRoles(session) {
    // Return all unique roles actively chosen in current session, for completeness
    return Object.values(session.users).map(u => u.role);
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
let adminClients = new Set();

function broadcastAdminUpdate(session) {
    for (let ws of adminClients) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'mission_update',
                stages: session.timeline,
                state: { stageIdx: session.timeline.findIndex(st=>!st.complete) },
                events: session.events
            }));
        }
    }
}

function checkAndAdvanceStage(session) {
    // Find the first incomplete stage
    let curStageIdx = session.timeline.findIndex(st => !st.complete);
    if (curStageIdx === -1) return; // All done
    let curStage = session.timeline[curStageIdx];
    if (
        curStage &&
        curStage.tasks &&
        Object.keys(curStage.tasks).length > 0 &&
        Object.keys(curStage.tasks).every(
            (role) => curStage.tasksDone && curStage.tasksDone[role]
        )
    ) {
        curStage.complete = true;
        broadcastToSession(session, {
            type: 'stage_complete',
            stageIdx: curStageIdx,
            stage: curStage,
            timeline: session.timeline
        });
        broadcastAdminUpdate(session); // Ensure admin panel updates immediately
        // Progress to next stage, if any
        if (curStageIdx < session.timeline.length - 1) {
            session.currentStage = curStageIdx + 1;
            const nextStage = session.timeline[session.currentStage];
            broadcastToSession(session, {
                type: 'stage_begin',
                stageIdx: session.currentStage,
                stage: nextStage,
                timeline: session.timeline
            });
            broadcastAdminUpdate(session); // Ensure admin panel updates for next stage tasks
        } else {
            // End of game/mission
            session.state = 'complete';
            broadcastToSession(session, {
                type: 'mission_end',
                scores: session.scores,
                timeline: session.timeline
            });
            broadcastAdminUpdate(session); // Ensure admin panel reflects mission end
        }
    }
}

wss.on('connection', (ws, req) => {
    let curSession = null;
    let curUser = null;
    let isAdmin = false;

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        // --- ADMIN PANEL API ---
        if (msg.type === 'admin_auth') {
            if (ADMIN_PASSWORD && msg.password === ADMIN_PASSWORD) {
                isAdmin = true;
                adminClients.add(ws);
                // Send current mission data for all active sessions (for now: just first session)
                const sessionKeys = Object.keys(sessions);
                let s = sessionKeys.length ? sessions[sessionKeys[0]] : getOrCreateSession('mission1');
                ws.send(JSON.stringify({
                    type: 'admin_ok',
                    stages: s.timeline,
                    state: { stageIdx: s.timeline.findIndex(st=>!st.complete) || 0 },
                    events: s.events
                }));
            } else {
                ws.send(JSON.stringify({ type: 'admin_fail' }));
            }
            return;
        }
        if (isAdmin) {
            // Only operate on one session for demo (can expand to multi-mission)
            const sessionKeys = Object.keys(sessions);
            let s = sessionKeys.length ? sessions[sessionKeys[0]] : getOrCreateSession('mission1');
            if (msg.type === 'admin_task_update') {
                const stage = s.timeline[msg.stageIdx];
                if (stage && stage.tasks) {
                    if (!stage.tasksDone) stage.tasksDone = {};
                    stage.tasksDone[msg.role] = msg.done;
                    // Broadcast with updated timeline to all clients for reactivity
                    broadcastToSession(s, {
                        type: 'progress',
                        progress: s.timeline.map(st => st.tasksDone || {}),
                        timeline: s.timeline
                    });
                    checkAndAdvanceStage(s);
                }
                ws.send(JSON.stringify({ type: 'status', message: 'Task status updated.', good: true }));
                broadcastAdminUpdate(s);
                return;
            }
            if (msg.type === 'admin_stage_complete') {
                const stage = s.timeline[msg.stageIdx];
                if (stage) {
                    stage.complete = true;
                    if (!stage.tasksDone) stage.tasksDone = {};
                    Object.keys(stage.tasks||{}).forEach(r => stage.tasksDone[r]=true);
                    broadcastToSession(s, {
                        type: 'stage_complete',
                        stageIdx: msg.stageIdx,
                        timeline: s.timeline
                    });
                    checkAndAdvanceStage(s);
                }
                ws.send(JSON.stringify({ type: 'status', message: 'Stage set complete.', good: true }));
                broadcastAdminUpdate(s);
                return;
            }
            if (msg.type === 'admin_inject_event') {
                const ev = missionData.emergencies[Math.floor(Math.random()*missionData.emergencies.length)];
                s.events.push(ev);
                broadcastToSession(s, { type: 'emergency', event: ev });
                ws.send(JSON.stringify({ type: 'status', message: 'Random event injected.', good: true }));
                broadcastAdminUpdate(s);
                return;
            }
            if (msg.type === 'admin_skip_stage') {
                const idx = s.timeline.findIndex(st => !st.complete);
                if (idx !== -1 && s.timeline[idx+1]) {
                    s.timeline[idx].complete = true;
                    s.timeline[idx+1].complete = false;
                    broadcastToSession(s, {
                        type: 'stage_complete',
                        stageIdx: idx,
                        timeline: s.timeline
                    });
                    checkAndAdvanceStage(s);
                    ws.send(JSON.stringify({ type: 'status', message: 'Skipped to next stage.', good: true }));
                    broadcastAdminUpdate(s);
                } else {
                    ws.send(JSON.stringify({ type: 'status', message: 'No next stage.', good: false }));
                }
                return;
            }
        }
        // --- END ADMIN PANEL ---

        if (msg.type === 'join') {
            // msg: missionId, name, team, role
            curSession = getOrCreateSession(msg.missionId);
            const userId = makeClientId();
            curUser = {
                id: userId,
                ws,
                name: msg.name,
                team: msg.team,
                role: msg.role,
                ready: false
            };
            curSession.users[userId] = curUser;
            ws.send(JSON.stringify({ type: 'joined', user: { id: userId, name: curUser.name, team: curUser.team, role: curUser.role }}));
            broadcastSessionUsers(curSession);
            // Send chat + mission timeline state, plus per-team roles/teams for late joiners
            ws.send(JSON.stringify({ type: 'sync', chat: curSession.chat, timeline: curSession.timeline, events: curSession.events, state: curSession.state, roles: missionData.roles, teams: missionData.teams }));
        } else if (msg.type === 'user_ready' && curSession && curUser) {
            curUser.ready = true;
            broadcastSessionUsers(curSession);
            // Start mission if all users ready
            if (Object.values(curSession.users).length > 1 && Object.values(curSession.users).every(u => u.ready)) {
                curSession.state = 'running';
                curSession.startTime = Date.now();
                broadcastToSession(curSession, { type: 'mission_start' });
            }
        } else if (msg.type === 'chat' && curSession && curUser) {
            // Chat message: {msg, channel}
            const entry = {
                ts: Date.now(),
                user: curUser.name + ' (' + curUser.role + ')',
                msg: msg.msg,
                channel: msg.channel
            };
            curSession.chat.push(entry);
            broadcastToSession(curSession, { type: 'chat', chat: entry });
        } else if (msg.type === 'task_update' && curSession && curUser) {
            // Task progress for timeline
            // msg: {stageIdx, role, done, data}
            const stage = curSession.timeline[msg.stageIdx];
            if (stage && !stage.tasksDone) stage.tasksDone = {};
            stage.tasksDone[curUser.role] = msg.done;
            // Broadcast update
            broadcastToSession(curSession, {
                type: 'progress',
                progress: curSession.timeline.map(s => s.tasksDone || {}),
                timeline: curSession.timeline
            });
            // Immediately update the admin panel!
            broadcastAdminUpdate(curSession);
            // Advance/check stages in a unified, robust way
            checkAndAdvanceStage(curSession);
        }
    });
    ws.on('close', () => {
        // Remove from session
        if (curSession && curUser) {
            delete curSession.users[curUser.id];
            broadcastSessionUsers(curSession);
        }
        if (isAdmin) adminClients.delete(ws);
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log('Space Mission Simulator server running on http://localhost:' + PORT);
    console.log('Admin panel at http://localhost:' + PORT + '/admin.html');
});

