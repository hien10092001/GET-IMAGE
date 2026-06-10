import { useState, useRef } from 'react'
import { Card, Input, Row, Col, Tag, Table, Button, message, Image, Modal, Spin } from 'antd'
import { FolderOpenOutlined, SearchOutlined, EyeOutlined } from '@ant-design/icons'

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']

function ImageCheck() {
  const [folderIn, setFolderIn] = useState('')
  const [folderSC, setFolderSC] = useState('')
  const [containerNo, setContainerNo] = useState('')
  const [hinhIn, setHinhIn] = useState(null)
  const [hinhSC, setHinhSC] = useState(null)
  const [history, setHistory] = useState([])
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewList, setPreviewList] = useState([])
  const [previewTitle, setPreviewTitle] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const folderInRef = useRef(null)
  const folderSCRefs = useRef([])

  const checkFolderForContainer = async (handle, no) => {
    if (!handle || !no) return false
    try {
      const entries = []
      for await (const entry of handle.values()) {
        entries.push(entry)
      }
      return entries.some(e => e.kind === 'directory' && e.name.includes(no))
    } catch {}
    return false
  }

  const readImagesFromFolder = async (handles, containerNo) => {
    const urls = []
    const readTasks = []
    for (const handle of handles) {
      try {
        const entries = []
        for await (const entry of handle.values()) {
          entries.push(entry)
        }
        for (const entry of entries) {
          if (entry.kind === 'directory' && entry.name.includes(containerNo)) {
            const fileEntries = []
            for await (const fileEntry of entry.values()) {
              fileEntries.push(fileEntry)
            }
            for (const fe of fileEntries) {
              if (fe.kind === 'file') {
                const name = fe.name.toLowerCase()
                if (IMAGE_EXTS.some(ext => name.endsWith(ext))) {
                  readTasks.push((async () => {
                    const file = await fe.getFile()
                    return URL.createObjectURL(file)
                  })())
                }
              }
            }
          }
        }
      } catch {}
    }
    const results = await Promise.all(readTasks)
    urls.push(...results)
    return urls
  }

  const handleOpenImages = async (type) => {
    const label = type === 'in' ? 'Hình In' : 'Hình SC'
    const handles = type === 'in'
      ? (folderInRef.current ? [folderInRef.current] : [])
      : folderSCRefs.current
    if (!handles.length) {
      message.warning(`Chưa chọn folder ${label.toLowerCase()}`)
      return
    }
    setPreviewTitle(`${containerNo} - ${label}`)
    setPreviewLoading(true)
    setPreviewOpen(true)
    const urls = await readImagesFromFolder(handles, containerNo)
    setPreviewList(urls)
    setPreviewLoading(false)
  }

  const handleCloseImgPreview = () => {
    setPreviewOpen(false)
    previewList.forEach(url => URL.revokeObjectURL(url))
    setPreviewList([])
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
    if (!val) { setHinhIn(null); setHinhSC(null) }
  }

  const handleSearch = () => {
    if (containerNo) autoCheck(containerNo)
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
      render: (v, r) => v === null ? <Tag>---</Tag> : v
        ? <Tag color="green" className="cursor-pointer" onClick={() => handleOpenImages('in')}><EyeOutlined className="mr-1" />Có</Tag>
        : <Tag color="red">Không</Tag>,
    },
    { title: 'Hình SC', dataIndex: 'hinhSC', key: 'hinhSC', width: 100, align: 'center',
      render: (v, r) => v === null ? <Tag>---</Tag> : v
        ? <Tag color="green" className="cursor-pointer" onClick={() => handleOpenImages('sc')}><EyeOutlined className="mr-1" />Có</Tag>
        : <Tag color="red">Không</Tag>,
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
            <Input prefix={<SearchOutlined />} placeholder="Nhập Container No..." value={containerNo} onChange={e => handleNoChange(e.target.value.toUpperCase())} onPressEnter={handleSearch} />
          </Col>
          <Col>
            {hinhIn !== null && (
              <span className="mr-3">
                Hình In: {hinhIn
                  ? <Tag color="green" className="cursor-pointer" onClick={() => handleOpenImages('in')}><EyeOutlined className="mr-1" />Có</Tag>
                  : <Tag color="red">Không</Tag>}
              </span>
            )}
            {hinhSC !== null && (
              <span>
                Hình SC: {hinhSC
                  ? <Tag color="green" className="cursor-pointer" onClick={() => handleOpenImages('sc')}><EyeOutlined className="mr-1" />Có</Tag>
                  : <Tag color="red">Không</Tag>}
              </span>
            )}
          </Col>
        </Row>
      </Card>
      <Card title="Lịch sử kiểm tra">
        <Table columns={columns} dataSource={history} rowKey="checkedAt" pagination={{ pageSize: 20 }} size="small" />
      </Card>

      <Modal
        title={previewTitle}
        open={previewOpen}
        onCancel={handleCloseImgPreview}
        footer={null}
        width={800}
      >
        <Spin spinning={previewLoading}>
          <Image.PreviewGroup>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, minHeight: 100 }}>
              {previewList.map((url, i) => (
                <Image key={i} src={url} alt={`img-${i}`} width={150} height={150} style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid #d9d9d9' }} />
              ))}
              {!previewLoading && previewList.length === 0 && <p>Không có hình ảnh</p>}
            </div>
          </Image.PreviewGroup>
        </Spin>
      </Modal>
    </div>
  )
}

export default ImageCheck
