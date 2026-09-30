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
