const state = {
  accelerometer: { x: 0, y: 0, z: 9.81 },
  gyroscope: { x: 0, y: 0, z: 0 },
  magnetometer: { x: 0, y: 0, z: 45 },
  light: 120,
  proximity: 0,
  orientation: { azimuth: 0, pitch: 0, roll: 0 },
  installed: false,
};

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function installSensorSources(target = globalThis) {
  if (state.installed) return state;
  state.installed = true;
  const root = target && target.window ? target.window : target;
  if (!root || typeof root.addEventListener !== 'function') return state;

  const onMotion = (event) => {
    const acc = event.accelerationIncludingGravity || event.acceleration;
    if (acc) {
      state.accelerometer = {
        x: Number(acc.x) || 0,
        y: Number(acc.y) || 0,
        z: Number(acc.z) || 0,
      };
    }
    const rot = event.rotationRate;
    if (rot) {
      state.gyroscope = {
        x: Number(rot.alpha) || 0,
        y: Number(rot.beta) || 0,
        z: Number(rot.gamma) || 0,
      };
    }
    if (typeof event.interval === 'number' && event.interval > 0) {
      state.motionInterval = event.interval;
    }
  };

  const onOrientation = (event) => {
    state.orientation = {
      azimuth: Number(event.alpha) || 0,
      pitch: Number(event.beta) || 0,
      roll: Number(event.gamma) || 0,
    };
    if (Number.isFinite(event.webkitCompassHeading)) {
      state.magnetometer = { x: 0, y: 0, z: event.webkitCompassHeading };
    } else if (Number.isFinite(event.absolute) && event.absolute) {
      state.magnetometer = { x: 0, y: 0, z: Number(event.alpha) || 0 };
    }
  };

  const onLight = (event) => {
    if (Number.isFinite(event.value)) state.light = clamp(event.value, 0, 100000);
  };

  const onProximity = (event) => {
    if (Number.isFinite(event.value)) state.proximity = event.value;
    else if (event.near) state.proximity = 0;
  };

  const listeners = [
    ['devicemotion', onMotion],
    ['deviceorientationabsolute', onOrientation],
    ['deviceorientation', onOrientation],
    ['ambientlight', onLight],
    ['lightlevel', onLight],
  ];
  for (const [name, handler] of listeners) {
    try {
      root.addEventListener(name, handler, true);
    } catch (error) {
      void error;
    }
  }
  try {
    if (typeof root.DeviceMotionEvent?.requestPermission === 'function') {
      root.DeviceMotionEvent.requestPermission().catch(() => {});
    }
  } catch (error) {
    void error;
  }
  try {
    if (typeof root.DeviceOrientationEvent?.requestPermission === 'function') {
      root.DeviceOrientationEvent.requestPermission().catch(() => {});
    }
  } catch (error) {
    void error;
  }
  return state;
}

export function readSensorValues(type) {
  switch (type) {
    case 1:
      return state.accelerometer;
    case 2:
      return state.magnetometer;
    case 3:
      return state.orientation;
    case 4:
      return state.gyroscope;
    case 5:
      return { value: state.light, light: state.light };
    case 8:
      return { value: state.proximity, proximity: state.proximity };
    default:
      return null;
  }
}

export function sensorState() {
  return state;
}
