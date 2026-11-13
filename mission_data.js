// Mission roles and sample tasks/events
module.exports = {
  teams: ['Mission Control', 'Spacecraft Crew'],
  roles: {
    'Mission Control': ['Flight Director', 'CapCom', 'EECOM', 'Guidance'],
    'Spacecraft Crew': ['Commander', 'Pilot', 'Mission Specialist', 'Flight Engineer']
  },
  timeline: [
    {
      name: 'Launch Prep',
      tasks: {
        'Flight Director': {description: 'Authorize go/no-go for launch with checklist.'},
        'CapCom': {description: 'Confirm communications protocols.'},
        'EECOM': {description: 'Verify environmental & electrical readiness.'},
        'Guidance': {description: 'Initialize guidance system.'},
        'Commander': {description: 'Complete crew readiness check.'},
        'Pilot': {description: 'Verify flight controls.'},
        'Mission Specialist': {description: 'Secure experiment payloads.'},
        'Flight Engineer': {description: 'Check propulsion systems.'}
      }
    },
    {
      name: 'Launch',
      tasks: {
        'Flight Director': {description: 'Confirm launch sequence is armed.'},
        'CapCom': {description: 'Relay status to all stations.'},
        'EECOM': {description: 'Monitor launch vehicle environment.'},
        'Guidance': {description: 'Feed trajectory to flight computer.'},
        'Commander': {description: 'Command ignition.'},
        'Pilot': {description: 'Monitor vehicle instruments.'},
        'Mission Specialist': {description: 'Prepare for zero-g operations.'},
        'Flight Engineer': {description: 'Supervise engine performance.'}
      }
    },
    {
      name: 'Orbit Operations',
      tasks: {
        'Flight Director': {description: 'Approve orbital correction maneuver.'},
        'CapCom': {description: 'Maintain comms with ground/craft.'},
        'EECOM': {description: 'Check life support and internal environment.'},
        'Guidance': {description: 'Verify orbital path.'},
        'Commander': {description: 'Initiate burn maneuver.'},
        'Pilot': {description: 'Assist with spacecraft orientation.'},
        'Mission Specialist': {description: 'Begin primary experiment.'},
        'Flight Engineer': {description: 'Monitor propulsion & power systems.'}
      }
    },
    {
      name: 'Mission Emergency',
      tasks: {
        'Flight Director': {description: 'Direct and coordinate emergency protocols.'},
        'CapCom': {description: 'Communicate emergency response info.'},
        'EECOM': {description: 'Troubleshoot environmental hazards.'},
        'Guidance': {description: 'Plot emergency return or safe orbit.'},
        'Commander': {description: 'Lead on-board emergency response.'},
        'Pilot': {description: 'Execute contingency procedures.'},
        'Mission Specialist': {description: 'Stabilize experiments/equipment.'},
        'Flight Engineer': {description: 'Make repairs as needed.'}
      }
    },
    {
      name: 'Return & Debrief',
      tasks: {
        'Flight Director': {description: 'Lead re-entry checklist.'},
        'CapCom': {description: 'Relay timeline and landing instructions.'},
        'EECOM': {description: 'Monitor re-entry environment.'},
        'Guidance': {description: 'Determine entry angle.'},
        'Commander': {description: 'Command re-entry.'},
        'Pilot': {description: 'Control descent.'},
        'Mission Specialist': {description: 'Secure experiment data.'},
        'Flight Engineer': {description: 'Monitor structural safety.'}
      }
    }
  ],
  emergencies: [
    {
      name: 'Life Support Anomaly',
      desc: 'Rapid action needed to restore oxygen regulation on spacecraft! Someone must direct, someone repair, someone monitor status.'
    },
    {
      name: 'Communications Glitch',
      desc: 'Mission Control and Spacecraft experience comm blackouts. Roles must sync using backup procedures.'
    },
    {
      name: 'Science Payload Malfunction',
      desc: 'Urgent! Science payload is unresponsive; requires crew and MC coordination to run diagnostics.'
    }
  ]
};

