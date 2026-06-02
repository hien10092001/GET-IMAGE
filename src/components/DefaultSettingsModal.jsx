import { useState } from 'react'
import { Modal, Input, Button, Tag, Space, Typography } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { loadDefaults, saveDefaults } from '../defaults'

const { Text } = Typography

function DefaultSettingsModal({ open, onClose }) {
  const [morning, setMorning] = useState([])
  const [evening, setEvening] = useState([])
  const [newMorning, setNewMorning] = useState('')
  const [newEvening, setNewEvening] = useState('')

  const handleOpen = () => {
    const cfg = loadDefaults()
    setMorning(cfg.morning)
    setEvening(cfg.evening)
    setNewMorning('')
    setNewEvening('')
  }

  const save = () => {
    saveDefaults({
      morning: morning.filter(Boolean),
      evening: evening.filter(Boolean),
    })
    onClose()
  }

  const addMorning = () => {
    if (!newMorning.trim()) return
    setMorning([...morning, newMorning.trim()])
    setNewMorning('')
  }

  const addEvening = () => {
    if (!newEvening.trim()) return
    setEvening([...evening, newEvening.trim()])
    setNewEvening('')
  }

  return (
    <Modal
      title="⚙️ Cài đặt công việc mặc định"
      open={open}
      afterOpenChange={(visible) => { if (visible) handleOpen() }}
      onOk={save}
      onCancel={onClose}
      okText="Lưu"
      cancelText="Hủy"
      width={500}
    >
      <Space direction="vertical" size="middle" className="w-full">
        <div>
          <Tag color="orange" className="mb-2">Buổi sáng</Tag>
          {morning.map((t, i) => (
            <div key={i} className="flex items-center gap-2 mb-1">
              <Text className="flex-1">{t}</Text>
              <Button type="text" danger size="small" icon={<DeleteOutlined />}
                onClick={() => setMorning(morning.filter((_, j) => j !== i))} />
            </div>
          ))}
          <Input.Search
            placeholder="Thêm công việc sáng..."
            value={newMorning}
            onChange={(e) => setNewMorning(e.target.value)}
            onSearch={addMorning}
            enterButton={<PlusOutlined />}
            size="small"
            className="mt-1"
          />
        </div>
        <div>
          <Tag color="purple" className="mb-2">Buổi tối</Tag>
          {evening.map((t, i) => (
            <div key={i} className="flex items-center gap-2 mb-1">
              <Text className="flex-1">{t}</Text>
              <Button type="text" danger size="small" icon={<DeleteOutlined />}
                onClick={() => setEvening(evening.filter((_, j) => j !== i))} />
            </div>
          ))}
          <Input.Search
            placeholder="Thêm công việc tối..."
            value={newEvening}
            onChange={(e) => setNewEvening(e.target.value)}
            onSearch={addEvening}
            enterButton={<PlusOutlined />}
            size="small"
            className="mt-1"
          />
        </div>
      </Space>
    </Modal>
  )
}

export default DefaultSettingsModal