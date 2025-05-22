let ws;
let missionStages = [], missionState = {}, missionEvents = [];
let sessionsList = [], selectedSession = null;
let panelLoadedFor = null;

function connectWS() {
    if (ws) ws.close();
    ws = new WebSocket(location.origin.replace('http','ws') + '/ws');
    ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'admin_auth' }));
    };
    ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.type === 'session_list') {
            sessionsList = data.sessions;
            showSessionSelect();
        } else if (data.type === 'admin_ok') {
            document.getElementById('panel').style.display = '';
            reloadPanel(data);
            panelLoadedFor = data.missionId;
        } else if (data.type === 'mission_update') {
            if (panelLoadedFor === data.missionId) {
              reloadPanel(data);
            }
        } else if (data.type === 'status') {
            flashMsg(data.message, data.good);
        }
    };
    ws.onclose = () => {
        setTimeout(() => {
            connectWS();
            flashMsg('Lost admin connection, retrying...', false);
        }, 2000);
    };
}

function showSessionSelect() {
    const sessionDiv = document.getElementById('sessionSelect');
    sessionDiv.innerHTML = '';
    // Loading state or empty
    if (!sessionsList.length) {
        sessionDiv.innerText = 'No active games. Start a game as a player.';
        document.getElementById('panel').style.display = 'none';
        panelLoadedFor = null;
        return;
    }
    const sel = document.createElement('select');
    sel.id = 'sessionDropdown';
    sel.innerHTML = sessionsList.map(s =>
        `<option value="${s.missionId}">${s.missionId} (${s.state}, users: ${s.numUsers}, stage: ${(s.stageIdx+1)||1})</option>`
    ).join('');
    sel.onchange = () => {
        if (sel.value !== panelLoadedFor) {
            selectSession(sel.value);
        }
    };
    sessionDiv.appendChild(sel);
    // If only one session and not loaded, auto-select it
    if (sessionsList.length === 1 && panelLoadedFor !== sessionsList[0].missionId) {
        selectSession(sessionsList[0].missionId);
    }
    // Otherwise, blank panel until changed
    if (!panelLoadedFor) {
        document.getElementById('panel').style.display = 'none';
    }
}

function selectSession(missionId) {
    selectedSession = missionId;
    ws.send(JSON.stringify({ type: 'admin_select_session', missionId }));
    document.getElementById('panel').style.display = 'none';
    panelLoadedFor = null;
}

function reloadPanel(data) {
    missionStages = data.stages;
    missionState = data.state;
    missionEvents = data.events||[];
    document.getElementById('currentStage').innerText = (missionState.stageIdx+1)||'?';
    document.getElementById('numStages').innerText = missionStages.length;
    document.getElementById('activeEvents').innerText = missionEvents.map(e=>e.name||e.type).join(", ");
    renderStages();
}

function renderStages() {
    const c = document.getElementById('stages');
    c.innerHTML = '';
    missionStages.forEach((stage, i) => {
        const block = document.createElement('div');
        block.className = 'stage-block';
        const head = document.createElement('div');
        head.innerHTML = `<strong>Stage ${i+1}: ${stage.name||''}</strong> <span style='color:${stage.complete?'#9f6':'#fd6'}'>${stage.complete?'(Complete)':'(Active)'}</span>`;
        block.appendChild(head);
        if (stage.tasks) {
            Object.entries(stage.tasks).forEach(([role, descObj]) => {
                const desc = descObj.description || descObj;
                const row = document.createElement('div');
                row.className = 'task-row';
                const done = stage.tasksDone && stage.tasksDone[role];
                row.innerHTML = `<label>${role}: ${desc}</label>`;
                const btn = document.createElement('button');
                btn.innerText = done ? 'Mark Incomplete' : 'Mark Complete';
                btn.disabled = false;
                btn.style.background = done ? '#c66' : '#393';
                btn.onclick = () => toggleTask(i, role, !done);
                row.appendChild(btn);
                block.appendChild(row);
            });
        }
        const sbtn = document.createElement('button');
        sbtn.innerText = 'Force Complete Stage';
        sbtn.onclick = () => forceCompleteStage(i);
        sbtn.style.background = '#28a'
        sbtn.style.marginTop = '1em';
        block.appendChild(document.createElement('br'));
        block.appendChild(sbtn);
        c.appendChild(block);
    });
}

function flashMsg(msg,good) {
    const m = document.getElementById('statusMsg');
    m.innerText = msg;
    m.style.color = good ? '#af6' : '#f66';
    setTimeout(()=>{ m.innerText = ''; },3000);
}

function toggleTask(stageIdx, role, done) {
    ws.send(JSON.stringify({ type:'admin_task_update', stageIdx, role, done }));
}

function forceCompleteStage(stageIdx) {
    ws.send(JSON.stringify({ type:'admin_stage_complete', stageIdx }));
}

function injectEvent() {
    ws.send(JSON.stringify({ type:'admin_inject_event' }));
}

function skipStage() {
    ws.send(JSON.stringify({ type:'admin_skip_stage' }));
}

// On page load
connectWS();
