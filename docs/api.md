# Fragma IoT API Documentation

Welcome to the Fragma REST API documentation. Devices communicate with Fragma via standard HTTP requests and JSON payloads.

---

## Base URL

When running locally in Laragon:
```
http://fragma.test/api
```
Or with direct host port:
```
http://localhost/fragma/api
```

---

## Authentication

Authentication is scoped per-entity using unique API keys formatted as:
```
frag_<48 hex characters>
```

Pass the API key in the `X-API-Key` HTTP header:
```http
X-API-Key: frag_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6
```

---

## Endpoints

### 1. Push Telemetry Data Point

Record a new data reading for an entity.

- **Method**: `POST`
- **Endpoint**: `/api/data.php?entity_id={entity_id}`
- **Headers**:
  - `Content-Type: application/json`
  - `X-API-Key: {your_api_key}`
- **Body**: JSON object with key-value pairs matching configured fields.

```json
{
  "temperature": 27.8,
  "humidity": 62.4,
  "status": "active"
}
```

#### Example Requests

**Windows Command Prompt (CMD)**:
```cmd
curl -X POST "http://fragma.test/api/data.php?entity_id=1" -H "Content-Type: application/json" -H "X-API-Key: your_key" -d "{\"temperature\": 27.8, \"humidity\": 62.4}"
```

**PowerShell**:
```powershell
Invoke-RestMethod -Uri "http://fragma.test/api/data.php?entity_id=1" -Method POST -Headers @{ "X-API-Key" = "your_key" } -ContentType "application/json" -Body '{"temperature": 27.8, "humidity": 62.4}'
```

**Linux / macOS (Bash)**:
```bash
curl -X POST "http://fragma.test/api/data.php?entity_id=1" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_key" \
  -d '{"temperature": 27.8, "humidity": 62.4}'
```

#### Response (`201 Created`)

```json
{
  "success": true,
  "data": {
    "id": 142,
    "entity_id": 1,
    "payload": {
      "temperature": 27.8,
      "humidity": 62.4,
      "status": "active"
    },
    "recorded_at": "2026-09-29 21:30:00"
  }
}
```

---

### 2. Query Telemetry Data Points

Retrieve historical data points for an entity.

- **Method**: `GET`
- **Endpoint**: `/api/data.php?entity_id={entity_id}`
- **Query Parameters**:
  - `limit`: Number of points to return (default: `100`, max: `500`).
  - `range`: Time filter (e.g. `1h`, `6h`, `24h`, `7d`).
  - `field`: Optional field filter to isolate a specific metric.
  - `latest=1`: If set, returns only the single latest data point.

#### Example Request
```http
GET /api/data.php?entity_id=1&range=24h&limit=50
```

---

### 3. Entity Management

#### List All Entities
```http
GET /api/entities.php
```

#### Get Entity Detail
```http
GET /api/entities.php?id={entity_id}
```

#### Create New Entity
- **Method**: `POST`
- **Endpoint**: `/api/entities.php`
- **Body**:
```json
{
  "name": "Weather Station ESP32",
  "fields": [
    { "name": "temperature", "type": "number", "unit": "°C" },
    { "name": "humidity", "type": "number", "unit": "%" }
  ]
}
```

#### Delete Entity
- **Method**: `DELETE`
- **Endpoint**: `/api/entities.php?id={entity_id}`
- **Header**: `X-API-Key: {your_api_key}`

---

### 4. Visual Widget Configuration

#### List Widgets for Entity
```http
GET /api/widgets.php?entity_id={entity_id}
```

#### Add Widget
- **Method**: `POST`
- **Endpoint**: `/api/widgets.php?entity_id={entity_id}`
- **Body**:
```json
{
  "type": "line-chart",
  "config": {
    "field": "temperature",
    "label": "Ambient Temperature",
    "color": "#4ecdc4",
    "unit": "°C"
  }
}
```

#### Remove Widget
```http
DELETE /api/widgets.php?id={widget_id}
```

---

## Device Code Examples

### cURL
```bash
curl -X POST "http://fragma.test/api/data.php?entity_id=1" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"temperature": 26.4, "humidity": 58.0}'
```

### Python 3
```python
import requests

url = "http://fragma.test/api/data.php?entity_id=1"
headers = {
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_API_KEY"
}
payload = {
    "temperature": 26.4,
    "humidity": 58.0
}

response = requests.post(url, json=payload, headers=headers)
print(response.status_code, response.json())
```

### ESP32 (Arduino C++)
```cpp
#include <WiFi.h>
#include <HTTPClient.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* serverUrl = "http://fragma.test/api/data.php?entity_id=1";
const char* apiKey = "YOUR_API_KEY";

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-API-Key", apiKey);
    
    String payload = "{\"temperature\": 26.4, \"humidity\": 58.0}";
    int httpResponseCode = http.POST(payload);
    http.end();
  }
  delay(10000);
}
```

---

## 6. PTS Release Candidate: REST API Integration & UI State Management

FRAGMA mengintegrasikan antarmuka telemetri multi-cluster berbasis **Fetch API**, **JSON**, dan **async/await** untuk evaluasi rilis kandidat PTS. Antarmuka ini menghubungkan platform dengan dua sumber REST API dan mendemonstrasikan penanganan siklus hidup data asinkron secara utuh (*loading, success, empty, dan error state*).

### 6.1. Stasiun Cuaca Ambien Publik (Open-Meteo Live API)

Digunakan untuk sinkronisasi telemetri iklim luar guna mengukur efisiensi *heat exchange* dan beban pendingin HVAC rak server internal.

- **Method**: `GET`
- **Endpoint**: `https://api.open-meteo.com/v1/forecast`
- **Autentikasi**: Tidak diperlukan (Publik / Standar WMO)
- **Parameter Query**:
  - `latitude`: Koordinat lintang stasiun cuaca terdekat (contoh: `-6.2088` Jakarta).
  - `longitude`: Koordinat bujur geografis (contoh: `106.8456`).
  - `current`: CSV daftar metrik telemetri yang diminta (`temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,weather_code`).
  - `timezone`: Zona waktu ISO/IANA (contoh: `Asia/Jakarta`).

#### Sintaks cURL:
```bash
curl -s "https://api.open-meteo.com/v1/forecast?latitude=-6.2088&longitude=106.8456&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,weather_code&timezone=Asia%2FJakarta"
```

#### Contoh Respon (`200 OK`):
```json
{
  "latitude": -6.221441,
  "longitude": 106.856186,
  "timezone": "Asia/Jakarta",
  "elevation": 12.0,
  "current_units": {
    "temperature_2m": "°C",
    "relative_humidity_2m": "%",
    "surface_pressure": "hPa",
    "wind_speed_10m": "km/h"
  },
  "current": {
    "temperature_2m": 31.2,
    "relative_humidity_2m": 58,
    "surface_pressure": 1014.5,
    "wind_speed_10m": 1.2,
    "weather_code": 1
  }
}
```

---

### 6.2. Mock Edge Gateway Cluster Internal (`/api/gateway.php`)

Endpoint gateway lokal untuk mereplikasi klaster sensor industri multi-node (suhu rack inflow/exhaust, daya listrik UPS, dan debit coolant chiller). Endpoint ini dirancang dengan parameter skenario deterministik untuk memvalidasi seluruh transisi state antarmuka.

- **Method**: `GET`
- **Endpoint**: `/api/gateway.php`
- **Autentikasi**: Publik / Gateway Internal
- **Parameter Skenario**:

| Parameter | Tipe | Nilai Skenario | Dampak State UI |
|---|---|---|---|
| `scenario` | `string` | `normal` (default) | **Success State (200 OK)**: Mengembalikan 4 node telemetri operasional aktif. |
| `scenario` | `string` | `empty` | **Empty State (200 OK)**: Mengembalikan array `nodes: []` kosong dengan pesan diagnostik. |
| `scenario` | `string` | `error` | **Error State (500 Error)**: Mengembalikan error status HTTP 500 beserta kode diagnosa bus fault. |
| `scenario` | `string` | `delay` | **Loading State**: Menambahkan simulasi latensi 2 detik (`sleep(2)`) sebelum merespon data. |
| `delay` | `int` | `1..5` | Menentukan durasi tunda kustom dalam detik. |

#### Sintaks Pengujian cURL Berdasarkan State:

1. **Uji Sukses (200 OK)**:
```bash
curl -s "http://localhost/fragma/api/gateway.php"
```

2. **Uji Kosong (Empty State)**:
```bash
curl -s "http://localhost/fragma/api/gateway.php?scenario=empty"
```

3. **Uji Galat (Error 500)**:
```bash
curl -s -i "http://localhost/fragma/api/gateway.php?scenario=error"
```

4. **Uji Loading (Delay 2 Detik)**:
```bash
curl -s "http://localhost/fragma/api/gateway.php?delay=2"
```

#### Struktur Payload Galat (`500 Internal Server Error`):
```json
{
  "success": false,
  "status": "error",
  "code": "GATEWAY_CLUSTER_TIMEOUT",
  "message": "Kesalahan Internal 500: Server edge gateway cluster gagal merespons permintaan telemetri.",
  "timestamp": "2026-10-07T02:23:18Z",
  "details": {
    "gateway_id": "FRAGMA-GW-EDGE-01",
    "error_origin": "Upstream Microcontroller Bus Fault",
    "suggested_action": "Periksa konektivitas jaringan transmisi atau ulangi permintaan."
  }
}
```

---

### 6.3. Pola Implementasi JavaScript (Fetch, JSON, async/await)

Semua komunikasi asinkron diimplementasikan menggunakan arsitektur penanganan kesalahan (*error boundary*) berikut:

```javascript
async function fetchTelemetry(targetUrl) {
    renderLoadingState();
    const startTime = performance.now();

    try {
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        const latencyMs = Math.round(performance.now() - startTime);
        const json = await response.json();

        if (!response.ok || json.success === false) {
            const err = new Error(json.message || `HTTP Error ${response.status}`);
            err.status = response.status;
            err.payload = json;
            throw err;
        }

        if (json.status === 'empty' || (Array.isArray(json.nodes) && json.nodes.length === 0)) {
            renderEmptyState(json, latencyMs, response.status);
            return;
        }

        renderSuccessState(json, latencyMs, response.status);
    } catch (err) {
        const latencyMs = Math.round(performance.now() - startTime);
        renderErrorState(err, latencyMs);
    }
}
```

