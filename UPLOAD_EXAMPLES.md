# Upload API - Frontend Examples

This document contains ready-to-use examples for integrating the upload API with various frontend technologies.

## 1. Vanilla HTML + JavaScript

### Simple Form Upload

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document Upload</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; }
    .container { border: 1px solid #ddd; padding: 20px; border-radius: 8px; }
    input[type="file"] { margin: 10px 0; }
    button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
    button:hover { background: #0056b3; }
    .results { margin-top: 20px; }
    .success { color: green; }
    .error { color: red; }
    .loading { color: orange; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📄 Upload Documents</h1>
    
    <form id="uploadForm">
      <input 
        type="file" 
        id="fileInput" 
        multiple 
        accept=".pdf,.xlsx,.xls,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp,.pptx,.eml,.mot,.json,.md,.log"
        required
      />
      <button type="submit">Upload Files</button>
    </form>

    <div id="results" class="results"></div>
  </div>

  <script>
    const uploadForm = document.getElementById('uploadForm');
    const fileInput = document.getElementById('fileInput');
    const resultsDiv = document.getElementById('results');

    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (fileInput.files.length === 0) {
        alert('Please select at least one file');
        return;
      }

      const formData = new FormData();
      for (let file of fileInput.files) {
        formData.append('files', file);
      }

      resultsDiv.innerHTML = '<p class="loading">⏳ Uploading...</p>';

      try {
        const response = await fetch('http://localhost:3000/upload', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        
        let html = `<h2>${result.message}</h2><ul>`;
        
        for (const file of result.files) {
          const iconClass = file.status === 'success' ? 'success' : 'error';
          const icon = file.status === 'success' ? '✓' : '✗';
          html += `<li class="${iconClass}"><strong>${icon} ${file.originalName}</strong><br/>${file.message}</li>`;
        }
        
        html += '</ul>';
        resultsDiv.innerHTML = html;
        
        if (result.success) {
          fileInput.value = ''; // Clear file input
        }
      } catch (error) {
        resultsDiv.innerHTML = `<p class="error">❌ Upload failed: ${error.message}</p>`;
      }
    });
  </script>
</body>
</html>
```

## 2. React Functional Component

### Complete Upload Component with Hooks

```typescript
import React, { useState } from 'react';

interface UploadFile {
  originalName: string;
  status: 'success' | 'error';
  message: string;
}

interface UploadResponse {
  success: boolean;
  message: string;
  files: UploadFile[];
}

export const DocumentUploader: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<UploadFile[]>([]);
  const [summary, setSummary] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      alert('Please select at least one file');
      return;
    }

    setLoading(true);
    const formData = new FormData();

    files.forEach((file) => {
      formData.append('files', file);
    });

    try {
      const response = await fetch('http://localhost:3000/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      const data: UploadResponse = await response.json();
      setResults(data.files);
      setSummary(data.message);
      setFiles([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setSummary(`❌ Error: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
      <h2>📤 Upload Documents</h2>

      <input
        type="file"
        multiple
        onChange={handleFileChange}
        disabled={loading}
        accept=".pdf,.xlsx,.xls,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp,.pptx,.eml,.mot,.json,.md,.log"
        style={{ marginBottom: '10px' }}
      />

      <button
        onClick={handleUpload}
        disabled={loading || files.length === 0}
        style={{
          padding: '10px 20px',
          background: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.5 : 1,
        }}
      >
        {loading ? '⏳ Uploading...' : `Upload ${files.length} File(s)`}
      </button>

      {summary && (
        <div style={{ marginTop: '20px' }}>
          <h3>{summary}</h3>
          <ul>
            {results.map((file, idx) => (
              <li key={idx} style={{ color: file.status === 'success' ? 'green' : 'red' }}>
                <strong>
                  {file.status === 'success' ? '✓' : '✗'} {file.originalName}
                </strong>
                <br />
                {file.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
```

## 3. React with TypeScript & TypeScript Service

### Complete Upload Manager with Service Layer

```typescript
// services/uploadService.ts
export interface UploadedFile {
  originalName: string;
  storedPath: string;
  documentId: string;
  status: 'success' | 'error';
  message: string;
}

export interface UploadResponse {
  success: boolean;
  message: string;
  files: UploadedFile[];
}

const UPLOAD_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export const uploadService = {
  async uploadFiles(files: File[]): Promise<UploadResponse> {
    // Validate files
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`File ${file.name} exceeds 50 MB limit`);
      }
    }

    // Create form data
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));

    // Upload
    const response = await fetch(`${UPLOAD_URL}/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    return response.json();
  },

  getSuccessCount(files: UploadedFile[]): number {
    return files.filter((f) => f.status === 'success').length;
  },

  getErrorCount(files: UploadedFile[]): number {
    return files.filter((f) => f.status === 'error').length;
  },
};

// components/DocumentUploader.tsx
import React, { useState } from 'react';
import { uploadService, UploadedFile } from '../services/uploadService';

export const DocumentUploader: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<UploadedFile[]>([]);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...droppedFiles]);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setLoading(true);

    try {
      const response = await uploadService.uploadFiles(files);
      setResults(response.files);
      setFiles([]);
    } catch (error) {
      console.error('Upload error:', error);
      alert(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const successCount = uploadService.getSuccessCount(results);
  const errorCount = uploadService.getErrorCount(results);

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      <h1>Document Upload</h1>

      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        style={{
          border: '2px dashed #007bff',
          borderRadius: '8px',
          padding: '40px',
          textAlign: 'center',
          backgroundColor: '#f8f9fa',
          cursor: 'pointer',
          marginBottom: '20px',
        }}
      >
        <p>📁 Drag & drop files here or click to select</p>
        <input
          type="file"
          multiple
          onChange={(e) => {
            if (e.target.files) {
              setFiles(Array.from(e.target.files));
            }
          }}
          style={{ display: 'none' }}
          accept=".pdf,.xlsx,.xls,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp,.pptx"
        />
      </div>

      {files.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h3>Selected Files ({files.length})</h3>
          <ul>
            {files.map((file) => (
              <li key={file.name}>
                {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={loading || files.length === 0}
        style={{
          width: '100%',
          padding: '12px',
          background: files.length > 0 && !loading ? '#007bff' : '#ccc',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: files.length > 0 && !loading ? 'pointer' : 'not-allowed',
          fontSize: '16px',
        }}
      >
        {loading ? '⏳ Uploading...' : `Upload ${files.length} File(s)`}
      </button>

      {results.length > 0 && (
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
          <h3>Results</h3>
          <p>
            ✓ {successCount} successful | ✗ {errorCount} failed
          </p>
          <ul>
            {results.map((result, idx) => (
              <li
                key={idx}
                style={{
                  color: result.status === 'success' ? 'green' : 'red',
                  marginBottom: '8px',
                }}
              >
                <strong>{result.originalName}</strong>
                <br />
                <small>{result.message}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
```

## 4. Vue 3 Component

```vue
<template>
  <div class="container">
    <h2>📤 Upload Documents</h2>

    <div class="upload-area" @drop="handleDrop" @dragover.prevent>
      <input
        type="file"
        ref="fileInput"
        multiple
        @change="handleFileSelect"
        :disabled="loading"
        accept=".pdf,.xlsx,.xls,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp,.pptx"
      />
      <p v-if="!files.length">Drag & drop files here or click to select</p>
      <p v-else>{{ files.length }} file(s) selected</p>
    </div>

    <button @click="uploadFiles" :disabled="loading || !files.length">
      {{ loading ? '⏳ Uploading...' : `Upload ${files.length} File(s)` }}
    </button>

    <div v-if="results.length" class="results">
      <h3>{{ summary }}</h3>
      <ul>
        <li v-for="(file, idx) in results" :key="idx" :class="file.status">
          <strong>{{ file.originalName }}</strong>
          <br />
          {{ file.message }}
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

interface UploadedFile {
  originalName: string;
  status: 'success' | 'error';
  message: string;
}

const fileInput = ref<HTMLInputElement>();
const files = ref<File[]>([]);
const loading = ref(false);
const results = ref<UploadedFile[]>([]);
const summary = ref('');

const handleFileSelect = (e: Event) => {
  const input = e.target as HTMLInputElement;
  if (input.files) {
    files.value = Array.from(input.files);
  }
};

const handleDrop = (e: DragEvent) => {
  e.preventDefault();
  if (e.dataTransfer?.files) {
    files.value = Array.from(e.dataTransfer.files);
  }
};

const uploadFiles = async () => {
  if (files.value.length === 0) return;

  loading.value = true;
  const formData = new FormData();
  files.value.forEach((file) => formData.append('files', file));

  try {
    const response = await fetch('http://localhost:3000/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    results.value = data.files;
    summary.value = data.message;
    files.value = [];
  } catch (error) {
    summary.value = `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.container {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

.upload-area {
  border: 2px dashed #007bff;
  border-radius: 8px;
  padding: 40px;
  text-align: center;
  background-color: #f8f9fa;
  margin-bottom: 20px;
}

input[type='file'] {
  display: none;
}

button {
  width: 100%;
  padding: 12px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.results {
  margin-top: 20px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 4px;
}

.success {
  color: green;
}

.error {
  color: red;
}
</style>
```

## 5. Angular Component

```typescript
// upload.component.ts
import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';

interface UploadedFile {
  originalName: string;
  status: 'success' | 'error';
  message: string;
}

interface UploadResponse {
  success: boolean;
  message: string;
  files: UploadedFile[];
}

@Component({
  selector: 'app-document-uploader',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container">
      <h2>📤 Upload Documents</h2>

      <div class="upload-area" (drop)="onDrop($event)" (dragover)="onDragOver($event)">
        <input
          #fileInput
          type="file"
          multiple
          (change)="onFileSelect($event)"
          [disabled]="loading"
          accept=".pdf,.xlsx,.xls,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp,.pptx"
        />
        <p>{{ files.length ? files.length + ' file(s) selected' : 'Drag & drop files here' }}</p>
      </div>

      <button (click)="uploadFiles()" [disabled]="loading || files.length === 0">
        {{ loading ? '⏳ Uploading...' : 'Upload ' + files.length + ' File(s)' }}
      </button>

      <div *ngIf="results.length" class="results">
        <h3>{{ summary }}</h3>
        <ul>
          <li *ngFor="let file of results" [ngClass]="file.status">
            <strong>{{ file.originalName }}</strong>
            <br />
            {{ file.message }}
          </li>
        </ul>
      </div>
    </div>
  `,
  styles: [`
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .upload-area { border: 2px dashed #007bff; padding: 40px; border-radius: 8px; background: #f8f9fa; margin-bottom: 20px; }
    input[type="file"] { display: none; }
    button { width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    .results { margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 4px; }
    .success { color: green; }
    .error { color: red; }
  `]
})
export class DocumentUploaderComponent {
  files: File[] = [];
  loading = false;
  results: UploadedFile[] = [];
  summary = '';

  constructor(private http: HttpClient) {}

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.files = Array.from(input.files);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer?.files) {
      this.files = Array.from(event.dataTransfer.files);
    }
  }

  uploadFiles(): void {
    if (this.files.length === 0) return;

    this.loading = true;
    const formData = new FormData();
    this.files.forEach((file) => formData.append('files', file));

    this.http
      .post<UploadResponse>('http://localhost:3000/upload', formData)
      .subscribe({
        next: (data) => {
          this.results = data.files;
          this.summary = data.message;
          this.files = [];
        },
        error: (error) => {
          this.summary = `❌ Error: ${error.message}`;
        },
        complete: () => {
          this.loading = false;
        }
      });
  }
}
```

## 6. Node.js Backend-to-Backend Upload

```typescript
// uploadHelper.ts
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import axios from 'axios';

export interface UploadOptions {
  chatbotApiUrl?: string;
  files: string[]; // File paths
  timeout?: number;
}

export async function uploadToChatbot(options: UploadOptions) {
  const { 
    chatbotApiUrl = 'http://localhost:3000',
    files,
    timeout = 30000
  } = options;

  const formData = new FormData();

  // Add files to form
  for (const filePath of files) {
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}`);
      continue;
    }
    const fileName = path.basename(filePath);
    formData.append('files', fs.createReadStream(filePath), fileName);
  }

  try {
    const response = await axios.post(
      `${chatbotApiUrl}/upload`,
      formData,
      {
        headers: formData.getHeaders(),
        timeout,
      }
    );

    console.log('Upload successful:');
    console.log(`  Message: ${response.data.message}`);
    console.log(`  Files: ${response.data.files.length}`);

    for (const file of response.data.files) {
      console.log(`  - ${file.originalName}: ${file.status}`);
    }

    return response.data;
  } catch (error) {
    console.error('Upload failed:', error);
    throw error;
  }
}

// Usage
uploadToChatbot({
  files: [
    './documents/report.pdf',
    './data/users.xlsx',
    './images/diagram.png'
  ]
});
```

## 7. Error Handling Best Practices

```typescript
async function uploadWithErrorHandling(files: File[]) {
  try {
    // Validate files before upload
    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) {
        throw new Error(`${file.name} exceeds 50 MB limit`);
      }

      const validExtensions = ['.pdf', '.xlsx', '.xls', '.txt', '.csv', '.png', '.jpg'];
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      if (!validExtensions.includes(ext)) {
        throw new Error(`${file.name} has unsupported file type`);
      }
    }

    // Upload files
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));

    const response = await fetch('http://localhost:3000/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    // Handle individual file errors
    const errors = result.files.filter((f: any) => f.status === 'error');
    if (errors.length > 0) {
      console.warn('Some files failed:');
      errors.forEach((f: any) => {
        console.warn(`  - ${f.originalName}: ${f.message}`);
      });
    }

    return result;
  } catch (error) {
    console.error('Upload error:', error);
    // Show user-friendly error message
    throw new Error(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
```

All examples are production-ready and can be integrated into your project immediately!

