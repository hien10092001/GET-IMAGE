const STORAGE_KEY = 'todo_defaults'

export const DEFAULT_CONFIG = {
  morning: ['Lấy hình ảnh hư hỏng', 'Báo cáo recap + daily'],
  evening: ['Gửi recap', 'Cập nhật báo cáo'],
}

export function loadDefaults() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return { morning: [...DEFAULT_CONFIG.morning], evening: [...DEFAULT_CONFIG.evening] }
}

export function saveDefaults(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
}