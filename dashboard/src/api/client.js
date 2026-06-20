// Lightweight fetch wrapper around the deployment platform REST API.
// Sends the HttpOnly session cookie and a CSRF header on state-changing requests.

import { useAuthStore } from '../stores/auth'
import router from '../router'

const BASE = '/api'

function csrfHeader() {
  const auth = useAuthStore()
  return auth.csrfToken ? { 'X-CSRF-Token': auth.csrfToken } : {}
}

function jsonRequest(method, body) {
  const hasBody = body !== undefined
  return {
    method,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...csrfHeader()
    },
    body: hasBody ? JSON.stringify(body) : undefined
  }
}

async function handle(res) {
  if (res.status === 401) {
    const auth = useAuthStore()
    auth.clear()
    if (router.currentRoute.value.name !== 'login') {
      router.replace({ name: 'login' })
    }
    throw new ApiError('Unauthorized', 401, null)
  }

  let body = null
  const text = await res.text()
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }

  if (!res.ok) {
    const message =
      (body && body.error) || (body && body.message) || `Request failed (${res.status})`
    throw new ApiError(message, res.status, body)
  }
  if (body && body.csrfToken) useAuthStore().setCsrf(body.csrfToken)
  return body
}

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export const api = {
  async get(path) {
    const res = await fetch(BASE + path)
    return handle(res)
  },

  async post(path, body) {
    const res = await fetch(BASE + path, jsonRequest('POST', body))
    return handle(res)
  },

  async put(path, body) {
    const res = await fetch(BASE + path, jsonRequest('PUT', body))
    return handle(res)
  },

  async patch(path, body) {
    const res = await fetch(BASE + path, jsonRequest('PATCH', body))
    return handle(res)
  },

  async del(path) {
    const res = await fetch(BASE + path, {
      method: 'DELETE',
      headers: { ...csrfHeader() }
    })
    return handle(res)
  },

  // Multipart upload via XHR so we can report progress.
  // fields: plain object of string fields. files: { fieldName: File }.
  // onProgress: (percent 0..100) => void
  upload(path, { fields = {}, files = {}, onProgress } = {}) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', BASE + path)

      const auth = useAuthStore()
      if (auth.csrfToken) xhr.setRequestHeader('X-CSRF-Token', auth.csrfToken)

      const form = new FormData()
      for (const [k, v] of Object.entries(fields)) form.append(k, v)
      for (const [k, f] of Object.entries(files)) form.append(k, f)

      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
        }
      }

      xhr.onload = () => {
        let body = null
        try {
          body = xhr.responseText ? JSON.parse(xhr.responseText) : null
        } catch {
          body = xhr.responseText
        }
        if (xhr.status === 401) {
          auth.clear()
          if (router.currentRoute.value.name !== 'login') router.replace({ name: 'login' })
          reject(new ApiError('Unauthorized', 401, body))
          return
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(body)
        } else {
          const message =
            (body && body.error) || (body && body.message) || `Upload failed (${xhr.status})`
          reject(new ApiError(message, xhr.status, body))
        }
      }
      xhr.onerror = () => reject(new ApiError('Network error during upload', 0, null))
      xhr.send(form)
    })
  },

  // Chunked/streamed deploy for large archives. Streams the file to the API in
  // sequential octet-stream chunks (never buffered whole), then completes the
  // session which starts the same build pipeline as a normal deploy.
  // Requires ENABLE_LARGE_UPLOADS on the server.
  async chunkedDeploy({ fields, file, onProgress, chunkSize = 8 * 1024 * 1024 } = {}) {
    const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize))
    const init = await this.post('/upload/init', {
      name: fields.name, slug: fields.slug, visibility: fields.visibility,
      totalSize: file.size, totalChunks
    })
    const id = init.uploadId
    try {
      let sent = 0
      for (let i = 0; i < totalChunks; i++) {
        const blob = file.slice(i * chunkSize, (i + 1) * chunkSize)
        const buf = await blob.arrayBuffer()
        const res = await fetch(`${BASE}/upload/${id}/chunk?index=${i}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', ...csrfHeader() },
          body: buf
        })
        if (!res.ok) {
          let body = null
          try { body = JSON.parse(await res.text()) } catch { /* ignore */ }
          throw new ApiError((body && body.error) || `Chunk ${i} failed (${res.status})`, res.status, body)
        }
        sent += blob.size
        if (onProgress) onProgress(Math.round((sent / file.size) * 100))
      }
      return await this.post(`/upload/${id}/complete`)
    } catch (e) {
      try { await this.del(`/upload/${id}`) } catch { /* best-effort cancel */ }
      throw e
    }
  }
}
