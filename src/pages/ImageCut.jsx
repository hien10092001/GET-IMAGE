import { useState, useRef, useEffect } from 'react'
import {
  Card, Button, Input, Space, Tooltip, Checkbox, Image, Alert, Empty, message, Typography,
} from 'antd'
import {
  FolderOpenOutlined, ReloadOutlined, FolderOutlined,
  SearchOutlined, LeftOutlined, RightOutlined, ScissorOutlined, CheckOutlined,
} from '@ant-design/icons'

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'])
const { Text } = Typography

const formatSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function ImageCut() {
  const [rootDir, setRootDir] = useState(null)
  const [breadcrumb, setBreadcrumb] = useState([])
  const [dirImages, setDirImages] = useState([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [previewIndex, setPreviewIndex] = useState(0)
  const [destCandidates, setDestCandidates] = useState([])
  const [destDir, setDestDir] = useState(null)
  const [newDirName, setNewDirName] = useState('')
  const [destKeyword, setDestKeyword] = useState('')
  const [moving, setMoving] = useState(false)
  const scanToken = useRef(0)
  const idRef = useRef(0)

  const loadCurrent = async (handle, crumb) => {
    const token = ++scanToken.current
    setLoading(true)
    setStatus('Đang quét...')
    const foundImages = []
    try {
      for await (const [name, child] of handle.entries()) {
        if (token !== scanToken.current) return
        if (child.kind === 'directory') continue
        const ext = name.split('.').pop().toLowerCase()
        if (!IMAGE_EXTS.has(ext)) continue
        try {
          const file = await child.getFile()
          foundImages.push({
            id: idRef.current++,
            name,
            handle: child,
            url: URL.createObjectURL(file),
            size: file.size,
          })
        } catch {
          // bỏ qua file không đọc được
        }
      }
      if (token !== scanToken.current) return
      foundImages.sort((a, b) => a.name.localeCompare(b.name))
      setBreadcrumb(crumb)
      setDirImages(foundImages)
      setSelectedIds(new Set())
      setPreviewIndex(0)
      const total = foundImages.reduce((s, i) => s + i.size, 0)
      setStatus(`Thư mục "${handle.name}": ${foundImages.length} ảnh (${formatSize(total)})`)
    } catch (err) {
      if (token === scanToken.current) setStatus('Lỗi quét: ' + err.message)
    } finally {
      if (token === scanToken.current) setLoading(false)
    }
  }

  const pickRoot = async () => {
    try {
      if (!window.showDirectoryPicker) {
        message.warning('Trình duyệt không hỗ trợ chọn thư mục')
        return
      }
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
      setRootDir(handle)
      await Promise.all([
        loadDestCandidates(handle),
        loadCurrent(handle, [{ name: handle.name, handle }]),
      ])
    } catch (err) {
      if (err.name !== 'AbortError') message.error('Không chọn được thư mục: ' + err.message)
    }
  }

  const loadDestCandidates = async (dirHandle) => {
    const handle = dirHandle || rootDir
    if (!handle) return
    const dirs = []
    try {
      for await (const [name, child] of handle.entries()) {
        if (child.kind === 'directory') dirs.push({ name, handle: child })
      }
    } catch (err) {
      message.error('Lỗi đọc FOULDER nhỏ: ' + err.message)
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name))
    setDestCandidates(dirs)
  }

  const destFiltered = destKeyword
    ? destCandidates.filter(d => d.name.toLowerCase().includes(destKeyword.toLowerCase()))
    : destCandidates

  const filtered = dirImages

  const currentImg = filtered.length > 0
    ? filtered[Math.min(previewIndex, filtered.length - 1)]
    : null

  const toggleSelect = (img) => {
    const next = new Set(selectedIds)
    if (next.has(img.id)) next.delete(img.id)
    else next.add(img.id)
    setSelectedIds(next)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(filtered.map(img => img.id)))
  }

  const shiftPreview = (delta) => {
    if (filtered.length === 0) return
    let idx = previewIndex + delta
    if (idx >= filtered.length) idx = 0
    if (idx < 0) idx = filtered.length - 1
    setPreviewIndex(idx)
  }

  const selectDest = (d) => {
    setDestDir(d.handle)
    message.success(`Đã chọn FOULDER nhỏ làm đích: ${d.name}`)
  }

  const createSubdir = async () => {
    if (!rootDir) {
      message.warning('Hãy chọn FOULDER tổng trước')
      return
    }
    const name = String(newDirName || '').trim()
    if (!name) {
      message.warning('Hãy nhập tên FOULDER nhỏ cần tạo')
      return
    }
    try {
      const dirHandle = await rootDir.getDirectoryHandle(name, { create: true })
      await loadDestCandidates()
      setDestDir(dirHandle)
      setMoving(false)
      setNewDirName('')
      setSelectedIds(new Set())
      message.success(`Đã tạo FOULDER nhỏ "${name}" và chọn làm đích`)
    } catch (err) {
      message.error('Không tạo được FOULDER nhỏ: ' + err.message)
    }
  }

  const moveSelected = async () => {
    const toMove = dirImages.filter(img => selectedIds.has(img.id))
    if (toMove.length === 0) {
      message.warning('Chưa chọn ảnh nào để cắt')
      return
    }
    if (!destDir) {
      message.warning('Hãy chọn 1 FOULDER nhỏ làm đích')
      return
    }
    setMoving(true)
    setStatus(`Đang cắt ${toMove.length} ảnh vào "${destDir.name}"...`)
    let ok = 0
    let fail = 0
    try {
      const BATCH = 10
      for (let i = 0; i < toMove.length; i += BATCH) {
        const batch = toMove.slice(i, i + BATCH)
        await Promise.all(batch.map(async (img) => {
          try {
            await img.handle.move(destDir)
            URL.revokeObjectURL(img.url)
            ok++
          } catch {
            fail++
          }
        }))
      }
    } finally {
      setMoving(false)
    }
    const remaining = dirImages.filter(img => {
      if (!selectedIds.has(img.id)) return true
      return false
    })
    setDirImages(remaining)
    setSelectedIds(new Set())
    if (fail > 0) {
      setStatus(`Hoàn thành: đã cắt ${ok} ảnh (${fail} ảnh lỗi)`)
      message.error(`${fail} ảnh không cắt được`)
    } else {
      setStatus(`Hoàn thành: đã cắt ${ok} ảnh vào "${destDir.name}"`)
      message.success(`Đã cắt ${ok} ảnh vào "${destDir.name}"`)
    }
    await loadDestCandidates()
  }

  const imagesRef = useRef([])
  useEffect(() => {
    imagesRef.current = dirImages
  })

  useEffect(() => {
    const current = imagesRef.current
    return () => {
      current.forEach(img => URL.revokeObjectURL(img.url))
      imagesRef.current = []
    }
  }, [rootDir])

  return (
    <Space direction="vertical" size="middle" className="w-full">
      <Card
        title={<Space><FolderOpenOutlined style={{ color: '#1677ff' }} /><Text strong>Chọn FOULDER tổng</Text></Space>}
      >
        <Button type="primary" size="large" icon={<FolderOpenOutlined />} onClick={pickRoot}>
          {rootDir ? `FOULDER tổng: ${rootDir.name}` : 'Chọn FOULDER tổng'}
        </Button>
        {rootDir && <Alert message={loading ? 'Đang xử lý...' : status} type="info" showIcon className="mt-3" />}
      </Card>

      {rootDir && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <Card
            className="lg:col-span-4"
            styles={{ body: { padding: 8 } }}
            title={
              <Space>
                <Text strong>FOULDER nhỏ làm đích</Text>
                <Tooltip title="Quét lại danh sách FOULDER nhỏ">
                  <Button size="small" icon={<ReloadOutlined />} onClick={() => loadDestCandidates(rootDir)} loading={loading} />
                </Tooltip>
              </Space>
            }
          >
            <Text type="secondary" style={{ fontSize: 12 }} className="block mb-1">
              Các FOULDER nhỏ trong "{rootDir.name}"
            </Text>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Tìm FOULDER nhỏ theo tên..."
              value={destKeyword}
              onChange={(e) => setDestKeyword(e.target.value)}
              className="mb-2"
            />
            <div className="text-xs font-medium text-gray-500 mb-1">Danh sách ({destFiltered.length}/{destCandidates.length})</div>
            <div className="border border-gray-200 rounded-lg p-1 max-h-[280px] overflow-y-auto">
              {destFiltered.length === 0 ? (
                <Empty description="Không tìm thấy FOULDER nhỏ" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                destFiltered.map((d) => {
                  const isDest = destDir === d.handle
                  return (
                    <div
                      key={d.name}
                      title={d.name}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg mb-1 border cursor-pointer ${isDest ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:bg-gray-50'}`}
                      onClick={() => selectDest(d)}
                    >
                      <FolderOutlined style={{ color: '#faad14' }} />
                      <Text strong className="text-sm truncate flex-1">{d.name}</Text>
                      {isDest && <CheckOutlined style={{ color: '#1677ff' }} />}
                    </div>
                  )
                })
              )}
            </div>
            <div className="mt-2 mb-2 text-xs">
              {destDir
                ? <Text type="success" strong>Đã chọn: {destFiltered.find(d => d.handle === destDir)?.name || destCandidates.find(d => d.handle === destDir)?.name || '...'}</Text>
                : <Text type="secondary">Chưa chọn FOULDER nhỏ làm đích</Text>}
            </div>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                placeholder="Tạo FOULDER nhỏ mới..."
                value={newDirName}
                onChange={(e) => setNewDirName(e.target.value)}
                onPressEnter={createSubdir}
                disabled={loading}
              />
              <Button type="primary" icon={<FolderOpenOutlined />} onClick={createSubdir} disabled={loading}>Tạo</Button>
            </Space.Compact>
          </Card>

          <Card
            className="lg:col-span-4"
            styles={{ body: { padding: 8 } }}
            title={
              <Space>
                <Text strong>Hình ảnh</Text>
                <Tooltip title="Quét lại">
                  <Button size="small" icon={<ReloadOutlined />} onClick={() => loadCurrent(breadcrumb[breadcrumb.length - 1]?.handle, breadcrumb)} loading={loading} />
                </Tooltip>
              </Space>
            }
          >
            <div className="flex items-center justify-between mb-1">
              <Text type="secondary" strong style={{ fontSize: 12 }}>Hình ảnh ({filtered.length}/{dirImages.length})</Text>
              {filtered.length > 0 && (
                <Button size="small" type="link" onClick={toggleSelectAll} className="!px-1">
                  {selectedIds.size === filtered.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                </Button>
              )}
            </div>
            <div className="border border-gray-200 rounded-lg p-1 max-h-[600px] overflow-y-auto">
              {filtered.length === 0 ? (
                <Empty description="Không có hình ảnh" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                filtered.map((img) => {
                  const isSelected = selectedIds.has(img.id)
                  const isPreview = currentImg && currentImg.id === img.id
                  return (
                    <div
                      key={img.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg mb-1 border cursor-pointer ${isSelected ? 'border-blue-500 bg-blue-50' : isPreview ? 'border-blue-300 bg-blue-50/50' : 'border-transparent hover:bg-gray-50'}`}
                      onClick={() => setPreviewIndex(filtered.indexOf(img))}
                    >
                      <Checkbox
                        checked={isSelected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleSelect(img)}
                      />
                      <Image
                        src={img.url}
                        alt={img.name}
                        preview={false}
                        width={40}
                        height={40}
                        className="object-cover rounded border border-gray-200 shrink-0"
                      />
                      <Tooltip title={img.name}>
                        <Text strong className="text-sm truncate flex-1">{img.name}</Text>
                      </Tooltip>
                      <Text type="secondary" className="text-xs shrink-0">{formatSize(img.size)}</Text>
                    </div>
                  )
                })
              )}
            </div>
          </Card>

          <Card
            className="lg:col-span-4"
            styles={{ body: { padding: 8 } }}
            title={
              <Space wrap>
                <Text strong>Xem trước</Text>
                {currentImg && (
                  <Text type="secondary" className="text-xs">
                    {previewIndex + 1}/{filtered.length} | {formatSize(currentImg.size)}
                    {selectedIds.size > 0 && ` | Đã chọn ${selectedIds.size}`}
                  </Text>
                )}
              </Space>
            }
          >
            <div className="min-w-0">
              {currentImg ? (
                <div className="bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center p-2" style={{ minHeight: 360, maxHeight: 460 }}>
                  <Image
                    src={currentImg.url}
                    alt={currentImg.name}
                    preview={false}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              ) : (
                <Empty description="Chọn 1 hình để xem trước" style={{ minHeight: 360 }} />
              )}
              {filtered.length > 0 && (
                <Space className="w-full mt-2 justify-center">
                  <Button icon={<LeftOutlined />} onClick={() => shiftPreview(-1)} disabled={loading} />
                  <Text type="secondary">{previewIndex + 1} / {filtered.length}</Text>
                  <Button icon={<RightOutlined />} onClick={() => shiftPreview(1)} disabled={loading} />
                </Space>
              )}
            </div>

            <Space direction="vertical" className="w-full mt-4" size="middle">
              <Button
                type="primary"
                danger
                size="large"
                icon={<ScissorOutlined />}
                onClick={moveSelected}
                loading={moving}
                disabled={selectedIds.size === 0 || !destDir || moving}
                block
              >
                CẮT HÌNH: chuyển {selectedIds.size} ảnh vào "{destDir?.name || '...'}"
              </Button>
              <Alert
                message={destDir
                  ? `Những ảnh đã chọn sẽ được chuyển (cắt) vào FOULDER nhỏ "${destDir.name}"`
                  : 'Chọn 1 FOULDER nhỏ làm đích trước, sau đó chọn ảnh và bấm "CẮT HÌNH".'}
                type="warning"
                showIcon
              />
            </Space>
          </Card>
        </div>
      )}
    </Space>
  )
}

export default ImageCut
