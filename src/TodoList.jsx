import { useState, useEffect, useCallback, useRef } from 'react'
import { Space, Alert, Row, Col } from 'antd'
import dayjs from 'dayjs'
import DailyView from './components/DailyView'
import HistoryView from './components/HistoryView'
import DefaultSettingsModal from './components/DefaultSettingsModal'
import { loadDefaults } from './defaults'

const API = '/api/todos'

function TodoList() {
  const [todos, setTodos] = useState([])
  const [dates, setDates] = useState([])
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const seededRef = useRef({})

  const seedDate = useCallback(async (date, cfg) => {
    const posts = []
    for (const title of cfg.morning) {
      posts.push(
        fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, date, session: 'morning' }),
        }).then(r => { if (!r.ok) throw new Error('seed failed') })
      )
    }
    for (const title of cfg.evening) {
      posts.push(
        fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, date, session: 'evening' }),
        }).then(r => { if (!r.ok) throw new Error('seed failed') })
      )
    }
    if (posts.length === 0) return
    await Promise.all(posts)
    const [todosRes, datesRes] = await Promise.all([
      fetch(`${API}?date=${date}`),
      fetch(`${API}/dates`),
    ])
    if (todosRes.ok) setTodos(await todosRes.json())
    if (datesRes.ok) setDates(await datesRes.json())
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const res = await fetch(`${API}?date=${selectedDate}`)
        if (!res.ok) throw new Error('Failed to fetch')
        const data = await res.json()
        if (cancelled) return
        if (data.length === 0 && !seededRef.current[selectedDate]) {
          seededRef.current[selectedDate] = true
          const cfg = loadDefaults()
          await seedDate(selectedDate, cfg)
          return
        }
        setTodos(data)
      } catch (err) {
        if (!cancelled) setStatus('Lỗi tải danh sách: ' + err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [selectedDate, seedDate])

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/dates`)
        if (!res.ok) throw new Error('Failed to fetch dates')
        const data = await res.json()
        setDates(data)
      } catch (err) {
        setStatus('Lỗi tải lịch sử: ' + err.message)
      }
    })()
  }, [])

  const fetchTodos = useCallback(async (date) => {
    try {
      setLoading(true)
      const d = date || selectedDate
      const res = await fetch(`${API}?date=${d}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setTodos(data)
    } catch (err) {
      setStatus('Lỗi tải danh sách: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  const fetchDates = useCallback(async () => {
    try {
      const res = await fetch(`${API}/dates`)
      if (!res.ok) throw new Error('Failed to fetch dates')
      const data = await res.json()
      setDates(data)
    } catch (err) {
      setStatus('Lỗi tải lịch sử: ' + err.message)
    }
  }, [])

  const addTodo = async (title, session) => {
    if (!title.trim()) return
    try {
      setStatus('')
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), date: selectedDate, session }),
      })
      if (!res.ok) throw new Error('Failed to add')
      seededRef.current[selectedDate] = true
      await fetchTodos()
      await fetchDates()
    } catch (err) {
      setStatus('Lỗi thêm công việc: ' + err.message)
    }
  }

  const toggleTodo = async (id, completed) => {
    try {
      const res = await fetch(`${API}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !completed }),
      })
      if (!res.ok) throw new Error('Failed to update')
      await fetchTodos()
    } catch (err) {
      setStatus('Lỗi cập nhật: ' + err.message)
    }
  }

  const deleteTodo = async (id) => {
    try {
      const res = await fetch(`${API}/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      await fetchTodos()
      await fetchDates()
    } catch (err) {
      setStatus('Lỗi xóa: ' + err.message)
    }
  }

  const handleSettingsClose = async () => {
    setSettingsOpen(false)
    delete seededRef.current[selectedDate]
    try {
      const res = await fetch(`${API}?date=${selectedDate}`)
      if (res.ok) {
        const todos = await res.json()
        await Promise.all(todos.map(t =>
          fetch(`${API}/${t._id}`, { method: 'DELETE' }).catch(() => {})
        ))
      }
    } catch (e) { /* ignore */ }
    const cfg = loadDefaults()
    await seedDate(selectedDate, cfg)
  }

  return (
    <div className="w-full px-4">
      <Space direction="vertical" size="middle" className="w-full">
        <Row gutter={16}>
          <Col xs={24} md={12} style={{ display: 'flex' }}>
            <div className="w-full">
              <DailyView
                todos={todos}
                loading={loading}
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
                onToggle={toggleTodo}
                onDelete={deleteTodo}
                onAdd={addTodo}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            </div>
          </Col>
          <Col xs={24} md={12} style={{ display: 'flex' }}>
            <div className="w-full">
              <HistoryView
                dates={dates}
                onSelectDate={(d) => { setSelectedDate(d); fetchTodos(d) }}
              />
            </div>
          </Col>
        </Row>

        {status && (
          <Alert message={status} type="info" showIcon closable onClose={() => setStatus('')} />
        )}
      </Space>

      <DefaultSettingsModal open={settingsOpen} onClose={handleSettingsClose} />
    </div>
  )
}

export default TodoList