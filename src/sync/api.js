// talking to the server. nothing here knows about the app, it only sends requests and turns failures into errors.

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status // 0 means we never reached the server
  }
}

export function createApi({ baseUrl, getToken, fetchFn = (...a) => fetch(...a) }) {
  async function call(method, path, body, auth = true) {
    const headers = { 'content-type': 'application/json' }
    if (auth) {
      const token = await getToken()
      if (!token) throw new ApiError(401, 'not signed in')
      headers.authorization = 'Bearer ' + token
    }
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 20000)
    let res
    try {
      res = await fetchFn(baseUrl + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal })
    } catch {
      throw new ApiError(0, 'no connection')
    } finally {
      clearTimeout(timer)
    }
    let data = null
    try { data = await res.json() } catch { /* an empty answer */ }
    if (!res.ok) throw new ApiError(res.status, (data && data.error) || 'request failed')
    return data
  }

  return {
    requestCode: (email) => call('POST', '/v1/auth/request', { email }, false),
    verify: (email, code, device) => call('POST', '/v1/auth/verify', { email, code, device }, false),
    logout: () => call('POST', '/v1/auth/logout', {}),
    me: () => call('GET', '/v1/me'),
    pull: (since, limit) => call('GET', `/v1/sync?since=${since}&limit=${limit}`),
    push: (changes) => call('POST', '/v1/sync', { changes }),
    exportAll: () => call('GET', '/v1/export'),
    deleteAccount: (email) => call('DELETE', '/v1/account', { confirm: email }),
  }
}
