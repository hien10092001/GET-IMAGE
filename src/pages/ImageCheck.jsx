import { useState, useRef } from 'react'
import { Card, Input, Row, Col, Tag, Table, Button, message } from 'antd'
import { FolderOpenOutlined, SearchOutlined } from '@ant-design/icons'

function ImageCheck() {
  const [folderIn, setFolderIn] = useState('')
  const [folderSC, setFolderSC] = useState('')
  const [containerNo, setContainerNo] = useState('')
  const [hinhIn, setHinhIn] = useState(null)
  const [hinhSC, setHinhSC] = useState(null)
  const [history, setHistory] = useState([])
  const folderInRef = useRef(null)
  const folderSCRefs = useRef([])

  const checkFolderForContainer = async (handle, no) => {
    if (!handle || !no) return false
    try {
      for await (const entry of handle.values()) {
        if (entry.kind === 'directory' && entry.name.includes(no)) return true
      }
    } catch {}
    return false
  }

  const autoCheck = async (no) => {
    const [inMatch, scMatch] = await Promise.all([
      checkFolderForContainer(folderInRef.current, no),
      Promise.all(folderSCRefs.current.map(h => checkFolderForContainer(h, no))).then(r => r.some(Boolean)),
    ])
    setHinhIn(inMatch)
    setHinhSC(scMatch)
    setHistory(prev => {
      const existing = prev.findIndex(h => h.containerNo === no)
      const entry = { containerNo: no, hinhIn: inMatch, hinhSC: scMatch, checkedAt: new Date().toISOString() }
      if (existing >= 0) {
        const next = [...prev]
        next[existing] = entry
        return next
      }
      return [entry, ...prev]
    })
  }

  const handleNoChange = (val) => {
    setContainerNo(val)
    if (val) autoCheck(val)
    else { setHinhIn(null); setHinhSC(null) }
  }

    const handlePickFolder = async (setter, ref) => {
    try {
      if (!window.showDirectoryPicker) { message.warning('Trình duyệt không hỗ trợ chọn folder'); return }
      const dir = await window.showDirectoryPicker()
      ref.current = dir
      setter(dir.name)
      if (containerNo) autoCheck(containerNo)
    } catch (err) {
      if (err.name !== 'AbortError') message.error('Không thể chọn folder')
    }
  }

  const handlePickFolderSC = async () => {
    try {
      if (!window.showDirectoryPicker) { message.warning('Trình duyệt không hỗ trợ chọn folder'); return }
      const dir = await window.showDirectoryPicker()
      folderSCRefs.current = [...folderSCRefs.current, dir]
      setFolderSC(prev => prev ? prev + '; ' + dir.name : dir.name)
      if (containerNo) autoCheck(containerNo)
    } catch (err) {
      if (err.name !== 'AbortError') message.error('Không thể chọn folder')
    }
  }

  const columns = [
    { title: 'Container No', dataIndex: 'containerNo', key: 'containerNo', width: 180 },
    { title: 'Hình In', dataIndex: 'hinhIn', key: 'hinhIn', width: 100, align: 'center',
      render: (v) => v === null ? <Tag>---</Tag> : v ? <Tag color="green">Có</Tag> : <Tag color="red">Không</Tag>,
    },
    { title: 'Hình SC', dataIndex: 'hinhSC', key: 'hinhSC', width: 100, align: 'center',
      render: (v) => v === null ? <Tag>---</Tag> : v ? <Tag color="green">Có</Tag> : <Tag color="red">Không</Tag>,
    },
    { title: 'Thời gian', dataIndex: 'checkedAt', key: 'checkedAt', width: 180,
      render: (v) => new Date(v).toLocaleString('vi-VN'),
    },
  ]

  return (
    <div>
      <Card title="Kiểm tra hình ảnh container" className="mb-4">
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={12} md={6}>
            <Input placeholder="Folder Hình In" value={folderIn} readOnly
              addonAfter={<Button size="small" type="text" icon={<FolderOpenOutlined />} onClick={() => handlePickFolder(setFolderIn, folderInRef)} />}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Input placeholder="Folder Hình SC" value={folderSC} readOnly
              addonAfter={<Button size="small" type="text" icon={<FolderOpenOutlined />} onClick={handlePickFolderSC} />}
            />
          </Col>
        </Row>
        <Row gutter={[12, 12]} align="middle" className="mt-3">
          <Col xs={24} sm={12} md={6}>
            <Input prefix={<SearchOutlined />} placeholder="Nhập Container No..." value={containerNo} onChange={e => handleNoChange(e.target.value.toUpperCase())} />
          </Col>
          <Col>
            {hinhIn !== null && (
              <span className="mr-3">
                Hình In: {hinhIn ? <Tag color="green">Có</Tag> : <Tag color="red">Không</Tag>}
              </span>
            )}
            {hinhSC !== null && (
              <span>
                Hình SC: {hinhSC ? <Tag color="green">Có</Tag> : <Tag color="red">Không</Tag>}
              </span>
            )}
          </Col>
        </Row>
      </Card>
      <Card title="Lịch sử kiểm tra">
        <Table columns={columns} dataSource={history} rowKey="checkedAt" pagination={{ pageSize: 20 }} size="small" />
      </Card>
    </div>
  )
}

export default ImageCheck
