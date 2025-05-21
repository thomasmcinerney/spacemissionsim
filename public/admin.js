let ws, adminpw = "";
let missionStages = [], missionState = {}, missionEvents = [];

function loginAdmin() {
    adminpw = document.getElementById("adminpw").value;
    connectWS();
}

function connectWS() {
    if (ws) ws.close();
    ws = new WebSocket(location.origin.replace('http','ws') + '/ws');
    ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'admin_auth', password: adminpw }));
    };
    ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.type === 'admin_fail') {
            document.getElementById('authFail').style.display = '';
            document.getElementById('panel').style.display = 'none';
        } else if (data.type === 'admin_ok') {
            document.getElementById('auth').style.display = 'none';
            document.getElementById('panel').style.display = '';
            reloadPanel(data);
        } else if (data.type === 'mission_update') {
            reloadPanel(data);
        } else if (data.type === 'status') {
            flashMsg(data.message, data.good);
        }
    };
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
            Object.entries(stage.tasks).forEach(([role, desc]) => {
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
        // Stage-level controls
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
    ws.send(JSON.stringify({ type:'admin_task_update', stageIdx, role, done, password: adminpw }));
}

function forceCompleteStage(stageIdx) {
    ws.send(JSON.stringify({ type:'admin_stage_complete', stageIdx, password: adminpw }));
}

function injectEvent() {
    ws.send(JSON.stringify({ type:'admin_inject_event', password: adminpw }));
}

function skipStage() {
    ws.send(JSON.stringify({ type:'admin_skip_stage', password: adminpw }));
}
