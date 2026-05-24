# API 文檔

## 基礎信息

- **Base URL**: `http://localhost:4000/api`
- **認證方式**: Bearer Token（JWT）
- **Content-Type**: `application/json`

---

## 認證 API

### POST /auth/login

用戶登入

**Request Body**
```json
{
  "email": "user@company.com",
  "password": "password123"
}
```

**Response**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "user@company.com",
    "name": "User Name",
    "role": "admin"
  }
}
```

### POST /auth/logout

用戶登出

**Headers**
```
Authorization: Bearer <refreshToken>
```

### POST /auth/refresh

刷新 Access Token

**Request Body**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

---

## 用戶管理（Admin only）

### GET /users

獲取用戶列表

**Response**
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@company.com",
      "name": "User Name",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### POST /users

創建用戶

**Request Body**
```json
{
  "email": "user@company.com",
  "name": "User Name",
  "password": "password123"
}
```

### GET /users/:id

獲取用戶詳情

### PUT /users/:id

更新用戶

**Request Body**
```json
{
  "name": "New Name",
  "email": "new@company.com"
}
```

### DELETE /users/:id

刪除用戶

---

## 項目管理

### GET /projects

獲取項目列表（按權限過濾）

**Response**
```json
{
  "projects": [
    {
      "id": "uuid",
      "name": "項目名稱",
      "description": "項目描述",
      "status": "active",
      "createdAt": "2024-01-01T00:00:00Z",
      "memberCount": 5
    }
  ]
}
```

### POST /projects

創建項目（PM/Admin）

**Request Body**
```json
{
  "name": "項目名稱",
  "description": "項目描述"
}
```

### GET /projects/:id

獲取項目詳情

**Response**
```json
{
  "id": "uuid",
  "name": "項目名稱",
  "description": "項目描述",
  "status": "active",
  "members": [
    {
      "id": "uuid",
      "userId": "uuid",
      "name": "成員名稱",
      "email": "member@company.com",
      "role": "developer"
    }
  ],
  "requirements": [...]
}
```

### PUT /projects/:id

更新項目

**Request Body**
```json
{
  "name": "新名稱",
  "description": "新描述",
  "status": "completed"
}
```

### DELETE /projects/:id

刪除項目（Admin only）

---

## 項目成員管理

### GET /projects/:id/members

獲取項目成員

### POST /projects/:id/members

添加項目成員

**Request Body**
```json
{
  "userId": "uuid",
  "role": "developer"
}
```

### DELETE /project-members/:id

移除項目成員

---

## 需求管理

### GET /projects/:id/requirements

獲取項目需求列表

**Response**
```json
{
  "requirements": [
    {
      "id": "uuid",
      "title": "需求標題",
      "description": "需求描述",
      "status": "pending",
      "taskCount": 3,
      "attachments": [...]
    }
  ]
}
```

### POST /projects/:id/requirements

創建需求

**Request Body**
```json
{
  "title": "需求標題",
  "description": "需求描述"
}
```

### PUT /requirements/:id

更新需求

**Request Body**
```json
{
  "title": "新標題",
  "description": "新描述",
  "status": "in_progress"
}
```

### DELETE /requirements/:id

刪除需求

---

## 任務管理

### GET /tasks

獲取任務列表（只返回指派給當前用戶的）

**Query Parameters**
- `projectId`: 按項目過濾
- `status`: 按狀態過濾
- `assigneeId`: 按負責人過濾

**Response**
```json
{
  "tasks": [
    {
      "id": "uuid",
      "title": "任務標題",
      "description": "任務描述",
      "status": "pending",
      "estimatedHours": 8,
      "assignee": {
        "id": "uuid",
        "name": "負責人"
      },
      "requirements": [...],
      "workLogs": [...]
    }
  ]
}
```

### POST /tasks

創建任務（Tech Lead/Admin）

**Request Body**
```json
{
  "title": "任務標題",
  "description": "任務描述",
  "assigneeId": "uuid",
  "requirementIds": ["uuid1", "uuid2"],
  "estimatedHours": 8
}
```

### GET /tasks/:id

獲取任務詳情

### PUT /tasks/:id

更新任務

**Request Body**
```json
{
  "title": "新標題",
  "status": "in_progress",
  "assigneeId": "uuid"
}
```

### DELETE /tasks/:id

刪除任務

---

## 缺陷管理

### GET /bugs

獲取缺陷列表

**Query Parameters**
- `taskId`: 按任務過濾
- `status`: 按狀態過濾
- `reporterId`: 按報告人過濾

**Response**
```json
{
  "bugs": [
    {
      "id": "uuid",
      "title": "缺陷標題",
      "description": "缺陷描述",
      "status": "open",
      "severity": "high",
      "reporter": {
        "id": "uuid",
        "name": "報告人"
      },
      "task": {
        "id": "uuid",
        "title": "關聯任務"
      }
    }
  ]
}
```

### POST /bugs

創建缺陷（Tester）

**Request Body**
```json
{
  "title": "缺陷標題",
  "description": "缺陷描述",
  "taskId": "uuid",
  "severity": "high"
}
```

### PUT /bugs/:id

更新缺陷

**Request Body**
```json
{
  "status": "resolved",
  "note": "修復說明"
}
```

### DELETE /bugs/:id

刪除缺陷

---

## 工作時數

### GET /worklogs

獲取工作時數列表

**Query Parameters**
- `userId`: 按用戶過濾
- `projectId`: 按項目過濾
- `taskId`: 按任務過濾
- `startDate`: 開始日期
- `endDate`: 結束日期

**Response**
```json
{
  "workLogs": [
    {
      "id": "uuid",
      "hours": 2.5,
      "workDate": "2024-01-15",
      "note": "完成了登入功能",
      "user": {
        "id": "uuid",
        "name": "用戶名"
      },
      "task": {
        "id": "uuid",
        "title": "任務標題"
      }
    }
  ]
}
```

### POST /worklogs

創建工作時數

**Request Body**
```json
{
  "taskId": "uuid",
  "bugId": "uuid",  // 可選，與 taskId 二選一
  "hours": 2.5,
  "workDate": "2024-01-15",
  "note": "完成了登入功能"
}
```

### PUT /worklogs/:id

更新工作時數

### DELETE /worklogs/:id

刪除工作時數

---

## 報表

### GET /reports/cost

項目成本報表

**Query Parameters**
- `projectId`: 項目 ID（必填）

**Response**
```json
{
  "project": {
    "id": "uuid",
    "name": "項目名稱"
  },
  "totalHours": 120.5,
  "members": [
    {
      "userId": "uuid",
      "name": "成員名稱",
      "totalHours": 40.5,
      "tasks": [
        {
          "taskId": "uuid",
          "title": "任務",
          "hours": 8
        }
      ]
    }
  ]
}
```

### GET /reports/progress

項目進度報表

**Query Parameters**
- `projectId`: 項目 ID（必填）

**Response**
```json
{
  "project": {
    "id": "uuid",
    "name": "項目名稱"
  },
  "totalRequirements": 10,
  "completedRequirements": 6,
  "requirementsProgress": 60,
  "totalTasks": 25,
  "completedTasks": 15,
  "tasksProgress": 60,
  "totalBugs": 5,
  "openBugs": 2,
  "resolvedBugs": 3
}
```

---

## 附件

### POST /attachments/upload

上傳附件

**Request**: `multipart/form-data`
- `file`: 文件
- `entityType`: 'requirement' | 'task'
- `entityId`: UUID

**Response**
```json
{
  "id": "uuid",
  "filename": "original-name.pdf",
  "storedPath": "uuid-filename.pdf",
  "mimeType": "application/pdf",
  "fileSize": 1024000
}
```

### GET /attachments/:id

下載附件

### DELETE /attachments/:id

刪除附件

---

## 錯誤響應

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "請先登入"
  }
}
```

### 錯誤碼

| 代碼 | 說明 |
|------|------|
| UNAUTHORIZED | 未登入或 Token 過期 |
| FORBIDDEN | 無權限訪問 |
| NOT_FOUND | 資源不存在 |
| VALIDATION_ERROR | 參數驗證失敗 |
| INTERNAL_ERROR | 服務器錯誤 |