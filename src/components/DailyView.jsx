import { List, Tag, Button, Checkbox, DatePicker, Empty, Spin, Typography, Input, Tooltip } from 'antd'
import { DeleteOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons'
import { Popconfirm } from 'antd'
import dayjs from 'dayjs'
import { useState } from 'react'

const { Text, Title } = Typography

const SESSION_META = {
  morning: { label: 'Buổi sáng', color: 'orange' },
  evening: { label: 'Buổi tối', color: 'purple' },
}

function SessionCard({ sessionKey, todos, onToggle, onDelete, onAdd }) {
  const [title, setTitle] = useState('')
  const meta = SESSION_META[sessionKey]

  const handleAdd = () => {
    if (!title.trim()) return
    onAdd(title.trim(), sessionKey)
    setTitle('')
  }

  return (
    <div className="mb-4">
      <Title level={5} className="m-0 mb-2">
        <Tag color={meta.color}>{meta.label}</Tag>
        <Tag>{todos.filter(t => t.completed).length}/{todos.length}</Tag>
      </Title>

      <Input.Search
        placeholder={`Thêm việc ${meta.label.toLowerCase()}...`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onSearch={handleAdd}
        enterButton={<PlusOutlined />}
        className="mb-2"
      />

      {todos.length === 0 ? (
        <Empty description="Chưa có công việc" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          size="small"
          dataSource={todos}
          renderItem={(todo) => (
            <List.Item
              className={`rounded px-2 ${todo.completed ? 'bg-green-50' : ''}`}
              actions={[
                <Popconfirm title="Xóa?" onConfirm={() => onDelete(todo._id)} okText="Xóa" cancelText="Hủy">
                  <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                </Popconfirm>,
              ]}
            >
              <Checkbox
                checked={todo.completed}
                onChange={() => onToggle(todo._id, todo.completed)}
              >
                <Text className={todo.completed ? 'line-through text-gray-400' : ''}>
                  {todo.title}
                </Text>
              </Checkbox>
            </List.Item>
          )}
        />
      )}
    </div>
  )
}

function DailyView({ todos, loading, selectedDate, onDateChange, onToggle, onDelete, onAdd, onOpenSettings }) {
  const morningTodos = todos.filter(t => t.session === 'morning' || !t.session)
  const eveningTodos = todos.filter(t => t.session === 'evening')

  return (
    <div className="border border-gray-200 rounded-lg p-3 h-full">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <Text strong className="text-base">📅 Nhật ký</Text>
        <div className="flex items-center gap-2">
          <Tag color="geekblue">{todos.filter(t => t.completed).length}/{todos.length}</Tag>
          <DatePicker
            value={dayjs(selectedDate)}
            onChange={(d) => { if (d) onDateChange(d.format('YYYY-MM-DD')) }}
            allowClear={false}
          />
          <Tooltip title="Cài đặt mặc định">
            <Button type="text" icon={<SettingOutlined />} onClick={onOpenSettings} />
          </Tooltip>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Spin size="large" /></div>
      ) : (
        <>
          <SessionCard
            sessionKey="morning"
            todos={morningTodos}
            onToggle={onToggle}
            onDelete={onDelete}
            onAdd={onAdd}
          />
          <SessionCard
            sessionKey="evening"
            todos={eveningTodos}
            onToggle={onToggle}
            onDelete={onDelete}
            onAdd={onAdd}
          />
        </>
      )}
    </div>
  )
}

export default DailyView