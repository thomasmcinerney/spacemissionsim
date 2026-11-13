# 🚀 Space Mission Simulator

A browser-based cooperative space mission game prototype. Players join Mission
Control or Spacecraft Crew, choose roles, and work through a shared mission
timeline. The Node.js server synchronizes players over WebSockets.

## Current capabilities

- Separate mission sessions identified by a shared mission code.
- Eight crew roles split between Mission Control and Spacecraft Crew.
- Five mission stages with role-specific task checklists.
- Mission chat and live task progress updates.
- An admin panel with task overrides, stage controls, and manually injected
  emergency messages.

## Requirements

- Node.js 22.x; `.nvmrc` specifies version 22.21.0.
- npm and a modern web browser.

## Install and run

From the project directory:

```sh
npm ci
npm start
```

Open [http://localhost:8080](http://localhost:8080). Use separate browser tabs for
different players, entering the same mission code to join the same session.

To use another port, set `PORT` when starting the server:

```sh
PORT=8081 npm start
```

Mission state is stored in memory and is lost when the server stops.

## Admin access

The admin panel is at [http://localhost:8080/admin.html](http://localhost:8080/admin.html).
It requires a non-empty `ADMIN_PASSWORD` environment variable in the server process.
There is no default password. Player sessions can run without this variable, but
admin login will be disabled.

In Bash or Zsh, run the following command, enter a password you choose locally,
and press Enter. Your input will not be echoed:

```sh
read -rs ADMIN_PASSWORD
```

Then export the variable and start the server:

```sh
export ADMIN_PASSWORD
npm start
```

Enter that password in the admin panel. Keep its value out of source files and
version control. If the server is already running, stop it before restarting with
the variable set.

## Playing the current scenario

1. Enter a display name and mission code, then select a team and role.
2. Have the other players join with the same mission code and distinct roles.
3. Click **Ready** for each player. The mission starts once at least two players
   are connected and all connected players are ready.
4. Complete the tasks for each role to progress through the timeline.

The current stage-completion logic expects all eight defined roles to finish
their tasks, even if fewer players started the mission. Use all eight roles to
exercise the complete scenario through player task completion.

## Current limitations

- Emergency messages are injected manually and have no resource effects or
  resolution mechanics.
- Scoring and a debrief report are not implemented.
- The admin panel operates on the first-created mission.
- Both chat channel choices currently broadcast to the whole mission.
- No automated test command is configured.

Use this prototype with trusted participants in a local development environment.

## Project layout

```text
spacemissionsim/
├── .gitignore
├── .nvmrc
├── LICENSE
├── README.md
├── mission_data.js      # Teams, roles, stages, and emergency messages
├── package.json
├── package-lock.json
├── server.js            # HTTP server, WebSockets, and in-memory mission state
└── public/
    ├── admin.html
    ├── admin.js
    ├── client.js
    ├── index.html
    └── styles.css
```

Edit `mission_data.js` to change the scenario and `public/` to change the browser
interface.

## License

MIT. See [LICENSE](LICENSE).
