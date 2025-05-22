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

// Expose roles, teams, and running sessions for frontend/admin
app.get('/mission_meta', (req, res) => {
    // Add running sessions to mission meta, with minimal info
    const runningSessions = Object.values(sessions).map(s => ({
        missionId: s.missionId,
        state: s.state,
        numUsers: Object.keys(s.users).length,
        stageIdx: s.timeline.findIndex(st => !st.complete),
        currentStage: s.currentStage
    }));
    res.json({
        roles: missionData.roles,
        teams: missionData.teams,
        runningSessions
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
        console.log(`[SESSION CREATED] missionId=${missionId}`);
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

function broadcastFullSessionState(session) {
    const state = {
        type: 'sync',
        chat: session.chat,
        timeline: session.timeline,
        events: session.events,
        state: session.state,
        roles: missionData.roles,
        teams: missionData.teams
    };
    Object.values(session.users).forEach(u => {
        if (u.ws.readyState === WebSocket.OPEN) {
            u.ws.send(JSON.stringify(state));
        }
    });
}

function allCurrentSessionRoles(session) {
    // Return all unique roles actively chosen in current session, for completeness
    return Object.values(session.users).map(u => u.role);
}

// Remove password protection for the admin panel (accept any admin connection)
let adminClients = new Set();

// ------- Admin multi-session support -------
// For each admin WebSocket, keep its selectedSessionId
const adminSessionMap = new Map(); // ws => sessionId

function sendAdminSessionList(ws) {
    const sessionList = Object.values(sessions).map(s => ({
        missionId: s.missionId,
        state: s.state,
        numUsers: Object.keys(s.users).length,
        stageIdx: s.timeline.findIndex(st => !st.complete),
        currentStage: s.currentStage
    }));
    ws.send(JSON.stringify({ type: 'session_list', sessions: sessionList }));
}

function sendAdminSessionState(ws, session) {
    ws.send(JSON.stringify({
        type: 'admin_ok',
        stages: session.timeline,
        state: { stageIdx: session.timeline.findIndex(st=>!st.complete) || 0 },
        events: session.events,
        missionId: session.missionId
    }));
}

function broadcastAdminUpdate(session) {
    for (let [ws, selSessionId] of adminSessionMap.entries()) {
        if (ws.readyState === WebSocket.OPEN && selSessionId === session.missionId) {
            ws.send(JSON.stringify({
                type: 'mission_update',
                stages: session.timeline,
                state: { stageIdx: session.timeline.findIndex(st=>!st.complete) },
                events: session.events,
                missionId: session.missionId
            }));
        }
    }
}

function checkAndAdvanceStage(session) {
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
        console.log(`[STAGE COMPLETE] missionId=${session.missionId} stage=${curStageIdx}`);
        broadcastToSession(session, {
            type: 'stage_complete',
            stageIdx: curStageIdx,
            stage: curStage,
            timeline: session.timeline
        });
        broadcastAdminUpdate(session); // Ensure admin panel updates immediately
        broadcastFullSessionState(session); // Ensure every player has the correct state
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
            broadcastFullSessionState(session);
        } else {
            // End of game/mission
            session.state = 'complete';
            console.log(`[MISSION COMPLETE] missionId=${session.missionId}`);
            broadcastToSession(session, {
                type: 'mission_end',
                scores: session.scores,
                timeline: session.timeline
            });
            broadcastAdminUpdate(session); // Ensure admin panel reflects mission end
            broadcastFullSessionState(session);
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
            isAdmin = true;
            adminClients.add(ws);
            adminSessionMap.set(ws, null); // no session selected
            // Send list of all active sessions/games
            sendAdminSessionList(ws);
            return;
        }
        if (isAdmin) {
            // Handle session select request
            if (msg.type === 'admin_select_session') {
                let s = msg.missionId && sessions[msg.missionId];
                if (s) {
                    adminSessionMap.set(ws, s.missionId);
                    sendAdminSessionState(ws, s);
                }
                return;
            }
            // Only operate if session selected
            let selectedId = adminSessionMap.get(ws);
            let s = selectedId ? sessions[selectedId] : null;
            if (!s) return; // No session selected, ignore all further admin actions until selected
            if (msg.type === 'admin_task_update') {
                const stage = s.timeline[msg.stageIdx];
                if (stage && stage.tasks) {
                    if (!stage.tasksDone) stage.tasksDone = {};
                    stage.tasksDone[msg.role] = msg.done;
                    console.log(`[ADMIN TASK UPDATE] missionId=${s.missionId} stage=${msg.stageIdx} role=${msg.role} done=${msg.done}`);
                    broadcastToSession(s, {
                        type: 'progress',
                        progress: s.timeline.map(st => st.tasksDone || {}),
                        timeline: s.timeline
                    });
                    broadcastFullSessionState(s);
                    checkAndAdvanceStage(s);
                }
                ws.send(JSON.stringify({ type: 'status', message: 'Task status updated.', good: true }));
                broadcastAdminUpdate(s);
                broadcastFullSessionState(s);
                return;
            }
            if (msg.type === 'admin_stage_complete') {
                const stage = s.timeline[msg.stageIdx];
                if (stage) {
                    stage.complete = true;
                    if (!stage.tasksDone) stage.tasksDone = {};
                    Object.keys(stage.tasks||{}).forEach(r => stage.tasksDone[r]=true);
                    console.log(`[ADMIN FORCE STAGE COMPLETE] missionId=${s.missionId} stage=${msg.stageIdx}`);
                    broadcastToSession(s, {
                        type: 'stage_complete',
                        stageIdx: msg.stageIdx,
                        timeline: s.timeline
                    });
                    broadcastFullSessionState(s);
                    checkAndAdvanceStage(s);
                }
                ws.send(JSON.stringify({ type: 'status', message: 'Stage set complete.', good: true }));
                broadcastAdminUpdate(s);
                broadcastFullSessionState(s);
                return;
            }
            if (msg.type === 'admin_inject_event') {
                const ev = missionData.emergencies[Math.floor(Math.random()*missionData.emergencies.length)];
                s.events.push(ev);
                console.log(`[ADMIN INJECT EVENT] missionId=${s.missionId}`);
                broadcastToSession(s, { type: 'emergency', event: ev });
                broadcastFullSessionState(s);
                ws.send(JSON.stringify({ type: 'status', message: 'Random event injected.', good: true }));
                broadcastAdminUpdate(s);
                broadcastFullSessionState(s);
                return;
            }
            if (msg.type === 'admin_skip_stage') {
                const idx = s.timeline.findIndex(st => !st.complete);
                if (idx !== -1 && s.timeline[idx+1]) {
                    s.timeline[idx].complete = true;
                    s.timeline[idx+1].complete = false;
                    console.log(`[ADMIN SKIP STAGE] missionId=${s.missionId} from stage=${idx} to ${idx+1}`);
                    broadcastToSession(s, {
                        type: 'stage_complete',
                        stageIdx: idx,
                        timeline: s.timeline
                    });
                    broadcastFullSessionState(s);
                    checkAndAdvanceStage(s);
                    ws.send(JSON.stringify({ type: 'status', message: 'Skipped to next stage.', good: true }));
                    broadcastAdminUpdate(s);
                    broadcastFullSessionState(s);
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
            ws.send(JSON.stringify({ type: 'sync', chat: curSession.chat, timeline: curSession.timeline, events: curSession.events, state: curSession.state, roles: missionData.roles, teams: missionData.teams }));
        } else if (msg.type === 'user_ready' && curSession && curUser) {
            curUser.ready = true;
            broadcastSessionUsers(curSession);
            if (Object.values(curSession.users).length > 1 && Object.values(curSession.users).every(u => u.ready)) {
                curSession.state = 'running';
                curSession.startTime = Date.now();
                broadcastToSession(curSession, { type: 'mission_start' });
                broadcastFullSessionState(curSession);
            }
        } else if (msg.type === 'chat' && curSession && curUser) {
            const entry = {
                ts: Date.now(),
                user: curUser.name + ' (' + curUser.role + ')',
                msg: msg.msg,
                channel: msg.channel
            };
            curSession.chat.push(entry);
            broadcastToSession(curSession, { type: 'chat', chat: entry });
            broadcastFullSessionState(curSession);
        } else if (msg.type === 'task_update' && curSession && curUser) {
            const stage = curSession.timeline[msg.stageIdx];
            if (!stage) {
                console.warn(`[TASK UPDATE] Stage index out of range: missionId=${curSession.missionId} stageIdx=${msg.stageIdx}`);
                return;
            }
            if (!stage.tasksDone) stage.tasksDone = {};
            if (!stage.tasks || !(curUser.role in stage.tasks)) {
                console.warn(`[TASK UPDATE] User role not found in stage tasks: missionId=${curSession.missionId} role=${curUser.role} stageIdx=${msg.stageIdx}`);
            }
            stage.tasksDone[curUser.role] = msg.done;
            console.log(`[PLAYER TASK COMPLETE] missionId=${curSession.missionId} stage=${msg.stageIdx} role=${curUser.role} done=${msg.done}`);
            broadcastToSession(curSession, {
                type: 'progress',
                progress: curSession.timeline.map(s => s.tasksDone || {}),
                timeline: curSession.timeline
            });
            broadcastFullSessionState(curSession);
            broadcastAdminUpdate(curSession);
            checkAndAdvanceStage(curSession);
        } else if (msg.type === 'request_sync' && curSession) {
            broadcastFullSessionState(curSession);
        }
    });
    ws.on('close', () => {
        if (curSession && curUser) {
            delete curSession.users[curUser.id];
            broadcastSessionUsers(curSession);
            broadcastFullSessionState(curSession);
        }
        if (isAdmin) {
            adminClients.delete(ws);
            adminSessionMap.delete(ws);
        }
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log('Space Mission Simulator server running on http://localhost:' + PORT);
    console.log('Admin panel at http://localhost:' + PORT + '/admin.html');
});
