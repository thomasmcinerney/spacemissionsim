# 🚀 Space Mission Simulator

A collaborative educational game modeled after professional space mission simulations. Designed for use by multiple players/roles across different devices or browser tabs.

## Features

- Real-time multiplayer via WebSockets
- Mission Control and Spacecraft Crew, each with unique roles
- Mission timeline: sequenced stages with tasks for each role
- Dynamic events/anomalies for realism
- In-game chat and communications
- Scoring and mission debrief

---

## Prerequisites

- [Node.js](https://nodejs.org/) (version 16+ recommended)

---

## Setup & Run Instructions

1. **Install dependencies**

   From the `space_mission_sim` directory, run:

   ```bash
   npm install express ws
   ```

2. **Start the server**

   ```bash
   node server.js
   ```

3. **Open the game in your browser**

   Navigate to:
   
   - [http://localhost:8080](http://localhost:8080)

   You can open multiple separate tabs, windows, or devices for each player.

---

## Gameplay

1. **Join as a team & role:** enter a mission name (any shared value), your player name, select a team (Mission Control or Spacecraft Crew), and a specific role.
2. **Ready up:** check "Ready". When all players are ready, the mission starts.
3. **Complete tasks:** each mission stage presents team/role-specific tasks. Work together with teammates & across teams!
4. **Handle emergencies:** dynamic events may require teamwork to resolve.
5. **Communicate:** use team and cross-team chat.
6. **Finish the mission:** after all stages, a debrief with results is shown.

---

## Customization

- **Add new roles/tasks/events**: Edit `mission_data.js` for richer scenarios.
- **Styling/UI**: Edit files in `public/`.
- **Advanced hosting**: for external access, use a hosting service and adjust port/firewall as needed.

---

## Troubleshooting

- If you do not see a styled interface, ensure you are opening via `http://localhost:8080` and Node.js started without errors.
- Use unique roles/names for each player/device/tab.
- For additional features or bugfixes, let the developer know!

---

## Directory Structure

```
space_mission_sim/
│   server.js           # Node.js game backend
│   mission_data.js     # Scenario roles, events, and tasks
│   README.md           # THIS FILE
└───public/             # Frontend
    │   index.html      # Main interface
    │   client.js       # Game UI/logic
    │   styles.css      # Styling
```

---

Enjoy your Space Mission Simulator experience!
