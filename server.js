const path = require('path');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const AUTH_URL = 'https://api.authentication.husqvarnagroup.dev/v1/oauth2/token';
const API_BASE_URL = 'https://api.smart.gardena.dev/v1';
const DEFAULT_LOCATION_ID = '81a9f060-0c9e-4fff-a58a-aab202c2ef92';
const MOWER_DEVICE_ID = '789c5051-fb7b-4851-be4e-ec3b1568b1b5';
const REQUIRED_ENV_KEYS = ['CLIENT_ID', 'CLIENT_SECRET', 'X_API_KEY'];

const tokenState = {
  accessToken: '',
  expiresAt: 0,
  refreshPromise: null,
};

const locationState = {
  locationId: '',
};

function getMissingEnvKeys() {
  return REQUIRED_ENV_KEYS.filter((key) => !String(process.env[key] || '').trim());
}

function hasValidConfig() {
  return getMissingEnvKeys().length === 0;
}

function createConfigError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function createApiHeaders(token) {
  return {
    'X-Api-Key': process.env.X_API_KEY,
    Authorization: `Bearer ${token}`,
    'Authorization-Provider': 'husqvarna',
    'Content-Type': 'application/vnd.api+json',
    Accept: 'application/vnd.api+json',
  };
}

function isAccessDeniedDetail(statusCode, detail) {
  const normalizedDetail = String(detail || '').trim().toLowerCase();
  if (!normalizedDetail) return false;
  if (statusCode !== 403 && statusCode !== 429) return false;
  return normalizedDetail.includes('explicit deny') || normalizedDetail.includes('not authorized to access this resource');
}

function formatGardenaApiDetail(statusCode, detail) {
  if (isAccessDeniedDetail(statusCode, detail)) {
    return 'Die aktuellen Gardena-Zugangsdaten dürfen diese Resource nicht lesen. Ich prüfe deshalb automatisch auf eine erreichbare freigegebene Location.';
  }
  return String(detail || '').trim() || 'Unbekannter Fehler';
}

async function requestNewAccessToken() {
  if (!hasValidConfig()) {
    throw createConfigError(`Fehlende .env-Werte: ${getMissingEnvKeys().join(', ')}`, 500);
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
  });

  const response = await fetch(AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
    signal: AbortSignal.timeout(15000),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.access_token) {
    const detail = payload?.error_description || payload?.error || response.statusText || 'Token konnte nicht geladen werden';
    throw createConfigError(`OAuth-Fehler (${response.status}): ${detail}`, response.status || 500);
  }

  const expiresInSeconds = Number(payload.expires_in) || 300;
  const safeLifetimeMs = Math.max((expiresInSeconds - 30) * 1000, 30000);

  tokenState.accessToken = payload.access_token;
  tokenState.expiresAt = Date.now() + safeLifetimeMs;

  return tokenState.accessToken;
}

async function ensureAccessToken(forceRefresh = false) {
  const tokenStillValid = tokenState.accessToken && Date.now() < tokenState.expiresAt;

  if (!forceRefresh && tokenStillValid) {
    return tokenState.accessToken;
  }

  if (!tokenState.refreshPromise) {
    tokenState.refreshPromise = requestNewAccessToken().finally(() => {
      tokenState.refreshPromise = null;
    });
  }

  return tokenState.refreshPromise;
}

async function gardenaRequest(endpoint, options = {}, retryOnUnauthorized = true) {
  const token = await ensureAccessToken();
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: options.method || 'GET',
    headers: createApiHeaders(token),
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 20000),
  });

  const responseText = await response.text();
  let payload = null;

  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch (error) {
    payload = responseText || null;
  }

  if (response.status === 401 && retryOnUnauthorized) {
    await ensureAccessToken(true);
    return gardenaRequest(endpoint, options, false);
  }

  if (!response.ok) {
    const rawDetail = typeof payload === 'string'
      ? payload
      : payload?.message || payload?.errors?.[0]?.detail || payload?.errors?.[0]?.title || response.statusText;
    const detail = formatGardenaApiDetail(response.status, rawDetail);
    const error = new Error(`Gardena API Fehler (${response.status}): ${detail}`);
    error.statusCode = response.status;
    error.payload = payload;
    error.rawDetail = rawDetail;
    throw error;
  }

  return payload;
}

function shouldRetryLocationResolution(error) {
  const statusCode = Number(error?.statusCode || 0);
  const rawDetail = String(error?.rawDetail || error?.message || '').trim();
  return statusCode === 403 || statusCode === 404 || statusCode === 429 || isAccessDeniedDetail(statusCode, rawDetail);
}

function extractLocationEntries(payload) {
  return Array.isArray(payload?.data)
    ? payload.data.filter((entry) => entry && typeof entry === 'object')
    : [];
}

async function loadAccessibleLocation() {
  const candidateIds = [];
  const cachedId = String(locationState.locationId || '').trim();
  const preferredId = String(DEFAULT_LOCATION_ID || '').trim();

  if (cachedId) {
    candidateIds.push(cachedId);
  }
  if (preferredId && !candidateIds.includes(preferredId)) {
    candidateIds.push(preferredId);
  }

  let lastError = null;

  for (const locationId of candidateIds) {
    try {
      const payload = await gardenaRequest(`/locations/${encodeURIComponent(locationId)}`);
      locationState.locationId = locationId;
      return { locationId, payload };
    } catch (error) {
      lastError = error;
      if (!shouldRetryLocationResolution(error)) {
        throw error;
      }
    }
  }

  const locationListPayload = await gardenaRequest('/locations');
  const locations = extractLocationEntries(locationListPayload);
  const fallbackLocationId = String(locations[0]?.id || '').trim();

  if (!fallbackLocationId) {
    if (lastError) throw lastError;
    throw createConfigError('Für die aktuellen Gardena-Zugangsdaten wurde keine erreichbare Location gefunden.', 404);
  }

  const payload = await gardenaRequest(`/locations/${encodeURIComponent(fallbackLocationId)}`);
  locationState.locationId = fallbackLocationId;
  return { locationId: fallbackLocationId, payload };
}

function getAttributeValue(item, attributeName) {
  return item?.attributes?.[attributeName]?.value ?? null;
}

function isOfflineState(...values) {
  return values
    .map((value) => String(value || '').trim().toUpperCase())
    .some((value) => value === 'OFFLINE' || value === 'UNAVAILABLE' || value === 'NOT_AVAILABLE');
}

function createEmptyValve(slot) {
  return {
    slot,
    deviceId: '',
    serviceId: '',
    name: `Ventil ${slot}`,
    activity: 'UNAVAILABLE',
    state: 'UNAVAILABLE',
    duration: null,
    online: false,
    unavailable: true,
  };
}

function createDeviceState(deviceId) {
  return {
    deviceId,
    common: null,
    mower: null,
    valves: [],
    valveSet: null,
    name: '',
    modelType: '',
    serial: '',
  };
}

function parseLocationStatus(payload, resolvedLocationId = '') {
  const included = Array.isArray(payload?.included) ? payload.included : [];
  const devices = new Map();

  for (const item of included) {
    if (item?.type !== 'DEVICE') continue;
    devices.set(item.id, createDeviceState(item.id));
  }

  for (const item of included) {
    if (!item?.type || item.type === 'DEVICE') continue;
    const deviceId = item?.relationships?.device?.data?.id;
    if (!deviceId) continue;

    if (!devices.has(deviceId)) {
      devices.set(deviceId, createDeviceState(deviceId));
    }

    const device = devices.get(deviceId);
    const nameValue = getAttributeValue(item, 'name');

    if (item.type === 'COMMON') {
      device.common = item;
      device.name = nameValue || device.name;
      device.modelType = getAttributeValue(item, 'modelType') || device.modelType;
      device.serial = getAttributeValue(item, 'serial') || device.serial;
    }
    if (item.type === 'MOWER') {
      device.mower = item;
    }
    if (item.type === 'VALVE') {
      device.valves.push(item);
      device.name = device.name || nameValue || '';
    }
    if (item.type === 'VALVE_SET') {
      device.valveSet = item;
    }
  }

  const mowerDevice = devices.get(MOWER_DEVICE_ID) || Array.from(devices.values()).find((device) => device.mower);
  const mowerCommon = mowerDevice?.common || null;
  const mowerService = mowerDevice?.mower || null;
  const mowerOnline = !isOfflineState(
    getAttributeValue(mowerCommon, 'state'),
    getAttributeValue(mowerCommon, 'rfLinkState'),
    getAttributeValue(mowerService, 'state'),
    getAttributeValue(mowerService, 'activity')
  );

  const mower = {
    deviceId: mowerDevice?.deviceId || MOWER_DEVICE_ID,
    name: mowerDevice?.name || 'eSusi',
    activity: getAttributeValue(mowerService, 'activity'),
    state: getAttributeValue(mowerService, 'state') || getAttributeValue(mowerCommon, 'state'),
    batteryLevel: getAttributeValue(mowerCommon, 'batteryLevel'),
    batteryState: getAttributeValue(mowerCommon, 'batteryState'),
    online: mowerOnline,
  };

  const valveMap = new Map();

  for (const device of devices.values()) {
    if (!Array.isArray(device.valves) || !device.valves.length) continue;

    for (const valve of device.valves) {
      if (!valve?.id) continue;
      const suffixMatch = /:(\d+)$/.exec(valve.id);
      if (!suffixMatch) continue;

      const slot = Number(suffixMatch[1]);
      if (slot < 1 || slot > 6) continue;

      const common = device.common;
      const activity = getAttributeValue(valve, 'activity') || getAttributeValue(valve, 'state') || getAttributeValue(common, 'state') || 'UNKNOWN';
      const state = getAttributeValue(valve, 'state') || getAttributeValue(common, 'state') || activity;

      valveMap.set(slot, {
        slot,
        deviceId: device.deviceId,
        serviceId: valve.id,
        name: getAttributeValue(valve, 'name') || device.name || `Ventil ${slot}`,
        activity,
        state,
        duration: getAttributeValue(valve, 'duration'),
        online: !isOfflineState(
          getAttributeValue(common, 'state'),
          getAttributeValue(common, 'rfLinkState'),
          getAttributeValue(valve, 'state'),
          activity
        ),
        unavailable: false,
      });
    }
  }

  const valves = Array.from({ length: 6 }, (_, index) => valveMap.get(index + 1) || createEmptyValve(index + 1));

  return {
    location: {
      id: payload?.data?.id || resolvedLocationId || DEFAULT_LOCATION_ID,
      name: payload?.data?.attributes?.name || 'GARDENA',
    },
    mower,
    valves,
  };
}

function validateCommandBody(body) {
  const serviceId = String(body?.serviceId || '').trim();
  const command = String(body?.command || '').trim().toUpperCase();
  const seconds = Number(body?.seconds);

  if (!serviceId) {
    throw createConfigError('serviceId fehlt.', 400);
  }

  if (!/:(?:[1-6])$/.test(serviceId)) {
    throw createConfigError('Ungültige Ventil-serviceId.', 400);
  }

  if (!['START_SECONDS_TO_OVERRIDE', 'STOP_UNTIL_NEXT_TASK'].includes(command)) {
    throw createConfigError('Ungültiger Command.', 400);
  }

  if (command === 'START_SECONDS_TO_OVERRIDE') {
    if (!Number.isInteger(seconds) || seconds < 60) {
      throw createConfigError('seconds muss eine Ganzzahl ab 60 sein.', 400);
    }
    if (seconds % 60 !== 0) {
      throw createConfigError('seconds muss ein Vielfaches von 60 sein.', 400);
    }
  }

  return { serviceId, command, seconds };
}

app.use(express.json({ limit: '100kb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});

app.get('/api/status', async (req, res) => {
  try {
    if (!hasValidConfig()) {
      throw createConfigError(`Fehlende .env-Werte: ${getMissingEnvKeys().join(', ')}`, 500);
    }

    const { locationId, payload } = await loadAccessibleLocation();
    const parsed = parseLocationStatus(payload, locationId);

    res.json({
      ok: true,
      fetchedAt: new Date().toISOString(),
      locationId,
      ...parsed,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message || 'Status konnte nicht geladen werden.',
    });
  }
});

app.post('/api/command', async (req, res) => {
  try {
    if (!hasValidConfig()) {
      throw createConfigError(`Fehlende .env-Werte: ${getMissingEnvKeys().join(', ')}`, 500);
    }

    const { serviceId, command, seconds } = validateCommandBody(req.body);
    const body = {
      data: {
        id: `request-${Date.now()}`,
        type: 'VALVE_CONTROL',
        attributes: {
          command,
          ...(command === 'START_SECONDS_TO_OVERRIDE' ? { seconds } : {}),
        },
      },
    };

    const payload = await gardenaRequest(`/command/${encodeURIComponent(serviceId)}`, {
      method: 'PUT',
      body,
      timeoutMs: 20000,
    });

    res.json({
      ok: true,
      serviceId,
      command,
      accepted: true,
      payload,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message || 'Befehl konnte nicht gesendet werden.',
    });
  }
});

app.use(express.static(__dirname, { dotfiles: 'ignore' }));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Nicht gefunden.' });
});

app.listen(PORT, async () => {
  console.log(`TOP2 Express Server läuft auf http://localhost:${PORT}`);
  if (!hasValidConfig()) {
    console.warn(`.env unvollständig. Fehlende Werte: ${getMissingEnvKeys().join(', ')}`);
    return;
  }
  try {
    await ensureAccessToken(true);
    console.log('Gardena access_token wurde beim Start erfolgreich geladen.');
  } catch (error) {
    console.error('Initialer Token-Load fehlgeschlagen:', error.message || error);
  }
});
