const SCOPES = [
  {
    key: 'admin',
    username: 'admin',
    allowedUsernames: ['admin'],
    label: 'DS CONTAINER',
    tabs: ['containers', 'depots', 'sanluong', 'sanluonght'],
  },
  {
    key: 'baogia',
    username: 'baogia',
    allowedUsernames: ['baogia', 'admin'],
    label: 'SL SC PAD',
    tabs: ['slscpad'],
  },
]

const storageKey = (scope) => `auth:${scope}`

export function scopeForTab(tab) {
  return SCOPES.find(scope => scope.tabs.includes(tab))?.key || null
}

export function requiredUsername(scope) {
  return SCOPES.find(item => item.key === scope)?.username || ''
}

export function allowedUsernames(scope) {
  const item = SCOPES.find(s => s.key === scope)
  if (!item) return []
  return item.allowedUsernames || (item.username ? [item.username] : [])
}

export function scopeLabel(scope) {
  return SCOPES.find(item => item.key === scope)?.label || ''
}

function readSession(scope) {
  try {
    const raw = localStorage.getItem(storageKey(scope))
    if (!raw) return null
    const session = JSON.parse(raw)
    const allowed = allowedUsernames(scope)
    if (!session?.token || !allowed.includes(session.user?.username)) return null
    return session
  } catch {
    return null
  }
}

function migrateLegacySession(scope) {
  try {
    const token = localStorage.getItem('token')
    const rawUser = localStorage.getItem('user')
    if (!token || !rawUser) return null
    const user = JSON.parse(rawUser)
    if (!allowedUsernames(scope).includes(user?.username)) return null
    const session = { token, user }
    localStorage.setItem(storageKey(scope), JSON.stringify(session))
    return session
  } catch {
    return null
  }
}

export function loadSession(scope) {
  return readSession(scope) || migrateLegacySession(scope)
}

export function loadSessions() {
  return SCOPES.reduce((result, scope) => {
    result[scope.key] = loadSession(scope.key)?.user || null
    return result
  }, {})
}

export function saveSession(scope, session) {
  if (!scope) return
  localStorage.setItem(storageKey(scope), JSON.stringify(session))
}

export function clearSession(scope) {
  if (scope) localStorage.removeItem(storageKey(scope))
}

export function getActiveScope() {
  return localStorage.getItem('activeScope') || null
}

export function activateSession(scope) {
  if (!scope) {
    localStorage.removeItem('activeScope')
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    return null
  }
  localStorage.setItem('activeScope', scope)
  const session = loadSession(scope)
  if (!session) {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    return null
  }
  localStorage.setItem('token', session.token)
  localStorage.setItem('user', JSON.stringify(session.user))
  return session.user
}
