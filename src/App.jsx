import { useState, lazy, Suspense } from 'react'
const XLSX = window.XLSX
import { ConfigProvider, Layout, Menu, Tag, Button, Card, Progress, Alert, Upload, Checkbox, Radio, InputNumber, Slider, Space, Typography, Row, Col, Divider, message, Select, Input } from 'antd'
import { FolderOpenOutlined, FileExcelOutlined, CopyOutlined, SearchOutlined, CompressOutlined, ScissorOutlined, DeleteOutlined, DownloadOutlined, UploadOutlined, ContainerOutlined, UserOutlined, LogoutOutlined, LockOutlined, FileImageOutlined, MenuFoldOutlined, MenuUnfoldOutlined, ShopOutlined } from '@ant-design/icons'
import ProtectedPages from './components/ProtectedPages'
import './App.css'

const ImageCheck = lazy(() => import('./pages/ImageCheck'))

const { Dragger } = Upload
const { Title, Text } = Typography

const { Sider, Content } = Layout

const COPY_CONCURRENCY = 10

async function copyDirectoryContents(srcDirHandle, destDirHandle) {
  const entries = []
  for await (const [name, handle] of srcDirHandle.entries()) {
    entries.push({ name, handle })
  }
  const files = entries.filter(e => e.handle.kind === 'file')
  const dirs = entries.filter(e => e.handle.kind === 'directory')

  const copyOneFile = async ({ name, handle }) => {
    const file = await handle.getFile()
    const newFileHandle = await destDirHandle.getFileHandle(name, { create: true })
    const writable = await newFileHandle.createWritable()
    await writable.write(file)
    await writable.close()
  }

  for (let i = 0; i < files.length; i += COPY_CONCURRENCY) {
    await Promise.all(files.slice(i, i + COPY_CONCURRENCY).map(copyOneFile))
  }

  await Promise.all(dirs.map(async ({ name, handle }) => {
    const newDirHandle = await destDirHandle.getDirectoryHandle(name, { create: true })
    await copyDirectoryContents(handle, newDirHandle)
  }))
}

function App() {
  const [collapsed, setCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState('excel')
  const [openKeys, setOpenKeys] = useState(['containers-group'])
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('user')
      if (stored) {
        const u = JSON.parse(stored)
        if (u && u.username) return u
      }
    } catch {
      localStorage.removeItem('user')
    }
    return null
  })

  const tabColors = {
    excel: '#1a73e8',
    dedup: '#e84315',
    compress: '#0ea042',
    rename: '#e67e22',
    containers: '#eb2f96',
    sanluong: '#13c2c2',
    imagecheck: '#fa8c16',
    depots: '#722ed1',
  }

  const handleLogin = (userData) => setUser(userData)

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
    setActiveTab('excel')
  }

  const containerGroupKey = 'containers-group'

  const tabItems = [
    { key: 'excel', icon: <FileExcelOutlined style={{ color: tabColors.excel }} />, label: <span style={{ color: activeTab === 'excel' ? tabColors.excel : undefined }}>Excel File Matcher</span> },
    { key: 'dedup', icon: <DeleteOutlined style={{ color: tabColors.dedup }} />, label: <span style={{ color: activeTab === 'dedup' ? tabColors.dedup : undefined }}>Xóa trùng Excel</span> },
    { key: 'compress', icon: <CompressOutlined style={{ color: tabColors.compress }} />, label: <span style={{ color: activeTab === 'compress' ? tabColors.compress : undefined }}>Giảm size hình</span> },
    { key: 'rename', icon: <FolderOpenOutlined style={{ color: tabColors.rename }} />, label: <span style={{ color: activeTab === 'rename' ? tabColors.rename : undefined }}>Đổi tên thư mục</span> },
    
    { key: 'imagecheck', icon: <FileImageOutlined style={{ color: tabColors.imagecheck }} />, label: <span style={{ color: activeTab === 'imagecheck' ? tabColors.imagecheck : undefined }}>Check Hình</span> },
{
      key: containerGroupKey,
      icon: <ContainerOutlined style={{ color: tabColors.containers }} />,
      label: <span>DS CONTAINER</span>,
      children: [
        { key: 'containers', icon: <ContainerOutlined style={{ color: tabColors.containers }} />, label: <span style={{ color: activeTab === 'containers' ? tabColors.containers : undefined }}>Containers</span> },
        { key: 'depots', icon: <ShopOutlined style={{ color: tabColors.depots }} />, label: <span style={{ color: activeTab === 'depots' ? tabColors.depots : undefined }}>Depot</span> },
        { key: 'sanluong', icon: <LockOutlined style={{ color: tabColors.sanluong }} />, label: <span style={{ color: activeTab === 'sanluong' ? tabColors.sanluong : undefined }}>Sản lượng</span> },
      ]
    },  
  ]

  const sidebarItems = tabItems.map(item => ({
    ...item,
    label: <span className="text-sm">{item.label}</span>,
    children: item.children?.map(child => ({
      ...child,
      label: <span className="text-sm">{child.label}</span>,
    })),
  }))

  const customTrigger = (
    <div className="sider-trigger">
      {collapsed ? <MenuUnfoldOutlined style={{ fontSize: 18 }} /> : <MenuFoldOutlined style={{ fontSize: 18 }} />}
    </div>
  )

  return (
    <ConfigProvider
      theme={{
        token: { colorPrimary: '#1a73e8', borderRadius: 8 },
        components: {
          Layout: {
            headerBg: '#ffffff',
            bodyBg: '#f5f5f5',
            siderBg: '#ffffff',
            headerHeight: 64,
          },
        },
      }}
    >
      <Layout className="min-h-screen">
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          trigger={customTrigger}
          theme="light"
          width={240}
          collapsedWidth={64}
          className="border-r border-gray-200 shadow-sm"
          style={{ position: 'sticky', top: 0, height: '100vh' }}
        >
          <div className={`sider-logo ${collapsed ? 'sider-logo-collapsed' : ''}`}>
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-sm shrink-0">
              <FileExcelOutlined className="text-white" style={{ fontSize: 18 }} />
            </div>
            {!collapsed && (
              <Title level={4} className="m-0 text-gray-800 whitespace-nowrap" style={{ margin: 0, letterSpacing: '-0.3px', fontSize: 16 }}>
                File Tools
              </Title>
            )}
          </div>
          <Menu
            mode="inline"
            selectedKeys={[activeTab]}
            openKeys={openKeys}
            onOpenChange={setOpenKeys}
            onClick={({ key }) => {
              if (key !== containerGroupKey) {
                setActiveTab(key)
                setOpenKeys([])
              }
            }}
            items={sidebarItems}
            className="border-0"
            style={{ background: 'transparent' }}
          />
          <div className={`sider-user ${collapsed ? 'sider-user-collapsed' : ''}`}>
            {user ? (
              collapsed ? (
                <Tag icon={<UserOutlined />} color="blue" className="m-0" />
              ) : (
                <Tag icon={<UserOutlined />} color="blue">{user.username} ({user.role})</Tag>
              )
            ) : (
              <Button type="primary" size="small" onClick={() => setActiveTab('containers')} className="w-full">
                {collapsed ? <UserOutlined /> : 'Đăng nhập'}
              </Button>
            )}
            {user && <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout} size="small" className="shrink-0" />}
          </div>
        </Sider>
        <Layout>
          <Content className="p-4 md:p-6 overflow-auto" style={{ background: '#f5f5f5', minHeight: '100vh' }}>
            {activeTab === 'excel' && <ExcelMatcher />}
            {activeTab === 'dedup' && <ExcelDeduplicator />}
            {activeTab === 'compress' && <ImageCompressor />}
            {activeTab === 'rename' && <RenameSubdirs />}
            {(activeTab === 'containers' || activeTab === 'depots' || activeTab === 'sanluong') && (
              <ProtectedPages activeTab={activeTab} user={user} onLogin={handleLogin} />
            )}
            {activeTab === 'imagecheck' && (
              <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading...</div>}>
                <ImageCheck />
              </Suspense>
            )}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  )
}

function ExcelMatcher() {
  const [excelData, setExcelData] = useState([])
  const [sourceDir, setSourceDir] = useState(null)
  const [destDir, setDestDir] = useState(null)
  const [matchedFiles, setMatchedFiles] = useState([])
  const [selectedFiles, setSelectedFiles] = useState(new Set())
  const [notFoundCodes, setNotFoundCodes] = useState([])
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [deleteAfterCopy, setDeleteAfterCopy] = useState(true)

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    try {
      setStatus('Đang đọc file Excel...')
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer)
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })

      const codes = []
      for (const row of data) {
        if (row[0] && String(row[0]).trim()) {
          codes.push(String(row[0]).trim().toUpperCase())
        }
      }

      setExcelData(codes)
      setMatchedFiles([])
      setSelectedFiles(new Set())
      setNotFoundCodes([])
      setProgress({ current: 0, total: 0 })
      setStatus(`Đã đọc ${codes.length} mã từ Excel`)
    } catch (err) {
      setStatus('Lỗi đọc file: ' + err.message)
    }
  }

  const pickSourceFolder = async () => {
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
      setSourceDir(dirHandle)
      setStatus(`Đã chọn thư mục tổng: ${dirHandle.name}`)
    } catch (err) {
      if (err.name !== 'AbortError') {
        setStatus('Lỗi chọn thư mục: ' + err.message)
      }
    }
  }

  const pickDestFolder = async () => {
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
      setDestDir(dirHandle)
      setStatus(`Đã chọn thư mục đích: ${dirHandle.name}`)
    } catch (err) {
      if (err.name !== 'AbortError') {
        setStatus('Lỗi chọn thư mục: ' + err.message)
      }
    }
  }

  const findMatches = async () => {
    if (!sourceDir || excelData.length === 0) return

    setStatus('Đang quét toàn bộ thư mục...')
    const matches = []
    const foundCodes = new Set()
    const codesSet = new Set(excelData)

    try {
      const codeList = excelData
      await scanDirectory(sourceDir, '', codesSet, matches, foundCodes, null, codeList)

      const notFound = excelData.filter(code => !foundCodes.has(code))
      setNotFoundCodes(notFound)
      setMatchedFiles(matches)
      setSelectedFiles(new Set(matches.map((_, i) => i)))
      setStatus(`Tìm thấy ${matches.length} file/folder trùng khớp`)
    } catch (err) {
      setStatus('Lỗi quét thư mục: ' + err.message)
    }
  }

  const scanDirectory = async (dirHandle, path, codesSet, matches, foundCodes, parentHandle, codeList) => {
    const entries = []
    for await (const [name, handle] of dirHandle.entries()) {
      entries.push({ name, handle })
    }

    const dirs = []
    for (const { name, handle } of entries) {
      const fullPath = path ? `${path}/${name}` : name
      const nameUpper = name.toUpperCase()

      if (codesSet.has(nameUpper) || codeList.some(code => nameUpper.includes(code))) {
        matches.push({ name, handle, fullPath, parentHandle: parentHandle || dirHandle })
        for (const code of codeList) {
          if (nameUpper === code || nameUpper.includes(code)) {
            foundCodes.add(code)
          }
        }
      } else if (handle.kind === 'directory') {
        dirs.push({ name, handle })
      }
    }

    await Promise.all(dirs.map(d =>
      scanDirectory(d.handle, path ? `${path}/${d.name}` : d.name, codesSet, matches, foundCodes, dirHandle, codeList)
    ))
  }

  const copyOneEntry = async ({ name, handle, parentHandle }) => {
    if (handle.kind === 'file') {
      const file = await handle.getFile()
      const newFileHandle = await destDir.getFileHandle(name, { create: true })
      const writable = await newFileHandle.createWritable()
      await writable.write(file)
      await writable.close()
      if (deleteAfterCopy) await parentHandle.removeEntry(name)
    } else if (handle.kind === 'directory') {
      await copyDirectory(handle, await destDir.getDirectoryHandle(name, { create: true }))
      if (deleteAfterCopy) await parentHandle.removeEntry(name, { recursive: true })
    }
  }

  const copyFiles = async () => {
    if (!sourceDir || matchedFiles.length === 0 || !destDir) return

    const toCopy = matchedFiles.filter((_, i) => selectedFiles.has(i))
    if (toCopy.length === 0) {
      setStatus('Chưa chọn file nào để chuyển!')
      return
    }

    setStatus('Đang chuyển file...')
    try {
      setProgress({ current: 0, total: toCopy.length })

      for (let i = 0; i < toCopy.length; i += COPY_CONCURRENCY) {
        const batch = toCopy.slice(i, i + COPY_CONCURRENCY)
        await Promise.all(batch.map(copyOneEntry))
        setProgress({ current: Math.min(i + COPY_CONCURRENCY, toCopy.length), total: toCopy.length })
        setStatus(`Đang chuyển ${Math.min(i + COPY_CONCURRENCY, toCopy.length)}/${toCopy.length}...`)
      }

      setStatus(`Hoàn thành! Đã chuyển tất cả file vào thư mục đích${deleteAfterCopy ? ' và xóa khỏi thư mục tổng' : ''}.`)
      setMatchedFiles([])
      setSelectedFiles(new Set())
      setNotFoundCodes([])
      setProgress({ current: 0, total: 0 })
    } catch (err) {
      setStatus('Lỗi chuyển: ' + err.message)
      setProgress({ current: 0, total: 0 })
    }
  }

  const copyDirectory = async (srcDirHandle, destDirHandle) => {
    await copyDirectoryContents(srcDirHandle, destDirHandle)
  }

  return (
    <Space direction="vertical" size="middle" className="w-full">
      <Card title={<Space><FileExcelOutlined /><Text strong>1. Upload file Excel</Text></Space>}>
        <Dragger
          accept=".xlsx,.xls,.csv"
          beforeUpload={(f) => { handleExcelUpload({ target: { files: [f] } }); return false }}
          showUploadList={false}
        >
          <p className="ant-upload-drag-icon"><UploadOutlined /></p>
          <p className="ant-upload-text">Click hoặc kéo thả file Excel vào đây</p>
          <p className="ant-upload-hint">.xlsx, .xls, .csv</p>
        </Dragger>
        {excelData.length > 0 && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <Text strong className="mb-2 block">Đã đọc {excelData.length} mã:</Text>
            <div className="flex flex-wrap gap-2">
              {excelData.slice(0, 20).map((code, i) => (
                <Tag key={i} color="blue">{code}</Tag>
              ))}
              {excelData.length > 20 && <Tag color="default">+{excelData.length - 20} mã khác</Tag>}
            </div>
          </div>
        )}
      </Card>

      <Card title={<Space><FolderOpenOutlined /><Text strong>2. Chọn thư mục tổng</Text></Space>}>
        <Button type="primary" icon={<FolderOpenOutlined />} onClick={pickSourceFolder} size="large">
          {sourceDir ? `Đã chọn: ${sourceDir.name}` : 'Chọn thư mục'}
        </Button>
      </Card>

      <Card title={<Space><FolderOpenOutlined /><Text strong>3. Chọn thư mục đích</Text></Space>}>
        <Text type="secondary" className="block mb-2">Nơi chứa file trùng khớp sau khi tìm thấy</Text>
        <Button type="primary" ghost icon={<FolderOpenOutlined />} onClick={pickDestFolder} size="large">
          {destDir ? `Đã chọn: ${destDir.name}` : 'Chọn thư mục đích'}
        </Button>
      </Card>

      <Card title={<Space><SearchOutlined /><Text strong>4. Tìm và copy file</Text></Space>}>
        <Button
          type="primary"
          icon={<SearchOutlined />}
          onClick={findMatches}
          disabled={!sourceDir || excelData.length === 0}
          size="large"
        >
          Tìm file trùng khớp
        </Button>

        {matchedFiles.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <Text strong>Tìm thấy {matchedFiles.length} file/folder:</Text>
              <Space>
                <Button size="small" onClick={() => setSelectedFiles(new Set(matchedFiles.map((_, i) => i)))}>Chọn tất cả</Button>
                <Button size="small" onClick={() => setSelectedFiles(new Set())}>Bỏ chọn tất cả</Button>
              </Space>
            </div>
            <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-2">
              {matchedFiles.map((file, i) => (
                <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer hover:bg-gray-50 ${selectedFiles.has(i) ? 'bg-blue-50' : ''}`}>
                  <Checkbox
                    checked={selectedFiles.has(i)}
                    onChange={(e) => {
                      const newSet = new Set(selectedFiles)
                      if (e.target.checked) newSet.add(i)
                      else newSet.delete(i)
                      setSelectedFiles(newSet)
                    }}
                  />
                  <Tag color={file.handle.kind === 'directory' ? 'warning' : 'success'}>{file.name}</Tag>
                </div>
              ))}
            </div>

            <Divider />
            <Checkbox checked={deleteAfterCopy} onChange={e => setDeleteAfterCopy(e.target.checked)} className="mb-2">
              Xóa file khỏi thư mục tổng sau khi copy
            </Checkbox>
            <Button
              type="primary"
              danger={deleteAfterCopy}
              icon={<CopyOutlined />}
              onClick={copyFiles}
              disabled={!destDir || selectedFiles.size === 0}
              size="large"
              block
            >
              {deleteAfterCopy ? `Chuyển ${selectedFiles.size} file (xóa khỏi thư mục tổng)` : `Copy ${selectedFiles.size} file vào thư mục đích (giữ lại thư mục tổng)`}
            </Button>
          </div>
        )}
      </Card>

      {status && (
        <Alert message={status} type="info" showIcon />
      )}

      {notFoundCodes.length > 0 && (
        <Card title={<Text type="danger">Không tìm thấy ({notFoundCodes.length} mã)</Text>} className="border-l-4 border-orange-400">
          <div className="flex flex-wrap gap-2 mb-3">
            {notFoundCodes.map((code, i) => (
              <Tag key={i} color="orange">{code}</Tag>
            ))}
          </div>
          <Button icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(notFoundCodes.join('\n')); message.success('Đã copy vào clipboard!') }}>
            Copy danh sách
          </Button>
        </Card>
      )}

      {matchedFiles.length > 0 && notFoundCodes.length === 0 && (
        <Alert message={`Tìm thấy tất cả ${excelData.length} mã từ Excel`} type="success" showIcon />
      )}

      {progress.total > 0 && (
        <Progress percent={Math.round((progress.current / progress.total) * 100)} format={() => `${progress.current}/${progress.total}`} />
      )}
    </Space>
  )
}

function ExcelDeduplicator() {
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [allRows, setAllRows] = useState([])
  const [selectedColumns, setSelectedColumns] = useState(new Set())
  const [duplicateIndices, setDuplicateIndices] = useState([])
  const [status, setStatus] = useState('')

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    try {
      setStatus('Đang đọc file Excel...')
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer)
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })

      if (data.length === 0) {
        setStatus('File Excel trống!')
        return
      }

      const hdrs = data[0]
      const rows = data.slice(1).filter(r => r.some(cell => cell !== undefined && cell !== null && cell !== ''))
      setHeaders(hdrs)
      setAllRows(rows)
      setRows(rows)

      const contnumIdx = hdrs.findIndex(h => String(h).trim().toLowerCase() === 'contnum')
      const defaultCols = contnumIdx !== -1 ? new Set([contnumIdx]) : new Set(hdrs.map((_, i) => i))
      setSelectedColumns(defaultCols)

      const dupIndices = findDuplicates(rows, defaultCols)
      setDuplicateIndices(dupIndices)

      const total = rows.length
      const unique = total - dupIndices.length
      setStatus(`Tổng: ${total} dòng | Duy nhất: ${unique} | Trùng: ${dupIndices.length}`)
    } catch (err) {
      setStatus('Lỗi đọc file: ' + err.message)
    }
  }

  const findDuplicates = (dataRows, colSet) => {
    const seen = new Map()
    const dupSet = new Set()
    for (let i = 0; i < dataRows.length; i++) {
      const key = buildKey(dataRows[i], colSet)
      if (key === '') continue
      if (seen.has(key)) {
        dupSet.add(i)
      } else {
        seen.set(key, i)
      }
    }
    return [...dupSet]
  }

  const buildKey = (row, colSet) => {
    const parts = []
    for (const col of colSet) {
      const val = row[col]
      parts.push(val !== undefined && val !== null ? String(val).trim().toLowerCase() : '')
    }
    return parts.join('||')
  }

  const toggleColumn = (colIndex) => {
    const newSet = new Set(selectedColumns)
    if (newSet.has(colIndex)) {
      if (newSet.size <= 1) return
      newSet.delete(colIndex)
    } else {
      newSet.add(colIndex)
    }
    setSelectedColumns(newSet)
    const dupIndices = findDuplicates(allRows, newSet)
    setDuplicateIndices(dupIndices)
    const total = allRows.length
    const unique = total - dupIndices.length
    setStatus(`Tổng: ${total} dòng | Duy nhất: ${unique} | Trùng: ${dupIndices.length}`)
  }

  const removeDuplicates = () => {
    const dupSet = new Set(duplicateIndices)
    const keptRows = allRows.filter((_, i) => !dupSet.has(i))
    const newData = [headers, ...keptRows]
    const ws = XLSX.utils.aoa_to_sheet(newData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    XLSX.writeFile(wb, 'cleaned_data.xlsx')
    setRows(keptRows)
    setAllRows(keptRows)
    setDuplicateIndices([])
    setStatus(`Đã xuất file cleaned_data.xlsx với ${keptRows.length} dòng duy nhất.`)
  }

  const duplicateRows = duplicateIndices.map(i => ({ index: i, row: allRows[i] }))

  return (
    <Space direction="vertical" size="middle" className="w-full">
      <Card title={<Space><FileExcelOutlined /><Text strong>1. Upload file Excel</Text></Space>}>
        <Dragger
          accept=".xlsx,.xls,.csv"
          beforeUpload={(f) => { handleUpload({ target: { files: [f] } }); return false }}
          showUploadList={false}
        >
          <p className="ant-upload-drag-icon"><UploadOutlined /></p>
          <p className="ant-upload-text">Click hoặc kéo thả file Excel vào đây</p>
          <p className="ant-upload-hint">.xlsx, .xls, .csv</p>
        </Dragger>
      </Card>

      {headers.length > 0 && (
        <Card title={<Space><DeleteOutlined /><Text strong>2. Chọn cột để so sánh trùng</Text></Space>}>
          <div className="flex flex-wrap gap-2">
            {headers.map((h, i) => (
              <Checkbox key={i} checked={selectedColumns.has(i)} onChange={() => toggleColumn(i)}>
                <Text strong={selectedColumns.has(i)}>{h}</Text>
              </Checkbox>
            ))}
          </div>
        </Card>
      )}

      {duplicateRows.length > 0 && (
        <Card title={<Space><Text type="danger">3. Các dòng trùng lặp ({duplicateRows.length})</Text></Space>}>
          <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-2">
            {duplicateRows.map(({ index, row }) => (
              <div key={index} className="flex items-center gap-2 px-3 py-2 rounded bg-blue-50 mb-1">
                <Tag color="red">#{index + 2}</Tag>
                <Text className="text-sm">
                  {headers.map((h, ci) => (
                    <span key={ci}>
                      {ci > 0 && <Text type="secondary"> - </Text>}
                      {row[ci] ?? ''}
                    </span>
                  ))}
                </Text>
              </div>
            ))}
          </div>
        </Card>
      )}

      {allRows.length > 0 && (
        <Card title={<Space><DownloadOutlined /><Text strong>4. Xóa trùng & Xuất file</Text></Space>}>
          <Text type="secondary" className="block mb-3">
            {duplicateRows.length > 0
              ? `Sẽ giữ lại ${allRows.length - duplicateIndices.length} dòng duy nhất.`
              : 'Không có dòng trùng lặp nào.'}
          </Text>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={removeDuplicates}
            disabled={duplicateIndices.length === 0}
            size="large"
          >
            Xóa {duplicateIndices.length} dòng trùng & Xuất Excel
          </Button>
        </Card>
      )}

      {status && <Alert message={status} type="info" showIcon />}
    </Space>
  )
}

function ImageCompressor() {
  const [sourceDir, setSourceDir] = useState(null)
  const [images, setImages] = useState([])
  const [quality, setQuality] = useState(80)
const [maxWidth, setMaxWidth] = useState(800)
const [maxHeight, setMaxHeight] = useState(600)
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [selectedFormats, setSelectedFormats] = useState(new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif']))

  const formatMap = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', bmp: 'image/bmp', gif: 'image/gif'
  }

  const formatExtensions = Object.keys(formatMap)

  const toggleFormat = (fmt) => {
    const newSet = new Set(selectedFormats)
    if (newSet.has(fmt)) newSet.delete(fmt)
    else newSet.add(fmt)
    setSelectedFormats(newSet)
  }

  const pickSourceFolder = async () => {
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
      setSourceDir(dirHandle)
      setImages([])
      setStatus(`Đã chọn thư mục nguồn: ${dirHandle.name}`)
    } catch (err) {
      if (err.name !== 'AbortError') setStatus('Lỗi: ' + err.message)
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const scanImages = async () => {
    if (!sourceDir) return
    setStatus('Đang quét thư mục tìm hình ảnh...')
    const found = []

    const walkDir = async (dirHandle, path, parentHandle) => {
      const entries = []
      for await (const [name, handle] of dirHandle.entries()) {
        entries.push({ name, handle })
      }
      const files = entries.filter(e => e.handle.kind === 'file')
      const dirs = entries.filter(e => e.handle.kind === 'directory')

      for (const { name, handle } of files) {
        const ext = name.split('.').pop().toLowerCase()
        if (selectedFormats.has(ext)) {
          const file = await handle.getFile()
          found.push({
            name,
            path: path ? `${path}/${name}` : name,
            handle,
            parentHandle: parentHandle || dirHandle,
            file,
            size: file.size,
            ext,
            compressedSize: null,
            status: 'pending'
          })
        }
      }
      await Promise.all(dirs.map(({ name, handle }) =>
        walkDir(handle, path ? `${path}/${name}` : name, handle)
      ))
    }

    try {
      await walkDir(sourceDir, '', sourceDir)
      setImages(found)
      const totalSize = found.reduce((s, img) => s + img.size, 0)
      setStatus(`Tìm thấy ${found.length} hình ảnh (tổng ${formatFileSize(totalSize)})`)
    } catch (err) {
      setStatus('Lỗi quét: ' + err.message)
    }
  }

  const compressImage = (file, qualityVal, mw, mh) => {
    return new Promise((resolve) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        let { width, height } = img
        if (width > mw) { height = Math.round(height * mw / width); width = mw }
        if (height > mh) { width = Math.round(width * mh / height); height = mh }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        let mimeType = file.type
        if (mimeType === 'image/bmp') mimeType = 'image/jpeg'

        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url)
          resolve(blob)
        }, mimeType, qualityVal / 100)
      }
      img.src = url
    })
  }

  const startCompress = async () => {
    if (images.length === 0) return

    setStatus('Đang nén hình...')
    setProgress({ current: 0, total: images.length })

    const updated = [...images]
    let done = 0
    const CONCURRENCY = 50

    const processOne = async (i) => {
      const img = updated[i]
      try {
        const compressedBlob = await compressImage(img.file, quality, maxWidth, maxHeight)
        let ext = img.ext
        if (img.ext === 'bmp') ext = 'jpg'

        const newName = img.name.replace(/\.[^.]+$/, '') + '.' + ext
        const parentDir = img.parentHandle
        const oldFileHandle = img.handle

        await parentDir.removeEntry(img.name).catch(() => {})

        const newFileHandle = await parentDir.getFileHandle(newName, { create: true })
        const writable = await newFileHandle.createWritable()
        await writable.write(compressedBlob)
        await writable.close()

        updated[i] = { ...img, compressedSize: compressedBlob.size, status: 'done' }
      } catch (err) {
        updated[i] = { ...img, status: 'error', error: err.message }
      }
    }

    for (let start = 0; start < updated.length; start += CONCURRENCY) {
      const batch = updated.slice(start, start + CONCURRENCY)
      await Promise.all(batch.map((_, idx) => processOne(start + idx)))
      done += batch.length
      setProgress({ current: done, total: images.length })
      setStatus(`Đang nén ${done}/${images.length} hình...`)
    }

    setImages(updated)

    const totalBefore = images.reduce((s, img) => s + img.size, 0)
    const totalAfter = updated.filter(img => img.compressedSize).reduce((s, img) => s + img.compressedSize, 0)
    const pct = totalBefore > 0 ? ((1 - totalAfter / totalBefore) * 100).toFixed(1) : 0
    setStatus(`Hoàn thành! Giảm từ ${formatFileSize(totalBefore)} → ${formatFileSize(totalAfter)} (${pct}%)`)
  }

  const totalSize = images.reduce((s, img) => s + img.size, 0)
  const doneSize = images.filter(img => img.compressedSize).reduce((s, img) => s + img.compressedSize, 0)

  return (
    <Space direction="vertical" size="middle" className="w-full">
      <Card title={<Space><FolderOpenOutlined /><Text strong>1. Chọn thư mục nguồn</Text></Space>}>
        <Button type="primary" icon={<FolderOpenOutlined />} onClick={pickSourceFolder} size="large">
          {sourceDir ? `Đã chọn: ${sourceDir.name}` : 'Chọn thư mục nguồn'}
        </Button>
        {sourceDir && (
          <Alert message="Ảnh sẽ được nén và ghi đè tại chỗ (cùng thư mục)" type="warning" showIcon className="mt-3" />
        )}
      </Card>

      <Card title={<Space><CompressOutlined /><Text strong>2. Định dạng hình ảnh & Quét</Text></Space>}>
        <Checkbox.Group
          value={[...selectedFormats]}
          onChange={(values) => setSelectedFormats(new Set(values))}
          className="flex flex-wrap gap-2"
        >
          {formatExtensions.map(fmt => (
            <Checkbox key={fmt} value={fmt}><Text> .{fmt}</Text></Checkbox>
          ))}
        </Checkbox.Group>
        {sourceDir && (
          <Button type="primary" ghost icon={<SearchOutlined />} onClick={scanImages} className="mt-3">
            Quét tìm hình ảnh
          </Button>
        )}
      </Card>

      <Card title={<Space><CompressOutlined /><Text strong>3. Tùy chọn nén</Text></Space>}>
        <Space direction="vertical" className="w-full" size="middle">
          <div>
            <Text strong className="block mb-1">Chất lượng: {quality}%</Text>
            <Slider min={10} max={100} value={quality} onChange={setQuality} />
          </div>
          <Row gutter={16}>
            <Col span={12}>
              <Text strong className="block mb-1">Chiều rộng tối đa (px)</Text>
              <InputNumber min={100} max={10000} value={maxWidth} onChange={setMaxWidth} className="w-full" />
            </Col>
            <Col span={12}>
              <Text strong className="block mb-1">Chiều cao tối đa (px)</Text>
              <InputNumber min={100} max={10000} value={maxHeight} onChange={setMaxHeight} className="w-full" />
            </Col>
          </Row>
        </Space>
      </Card>

      {images.length > 0 && (
        <Card title={<Space><Text strong>4. Danh sách hình ảnh ({images.length})</Text><Text type="secondary">{formatFileSize(totalSize)}</Text></Space>}>
          <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-2">
            {images.map((img, i) => {
              const saved = img.compressedSize ? ((1 - img.compressedSize / img.size) * 100).toFixed(1) : null
              return (
                <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded mb-1 ${img.status === 'done' ? 'bg-green-50' : img.status === 'error' ? 'bg-red-50' : ''}`}>
                  <Tag color={img.status === 'done' ? 'success' : img.status === 'error' ? 'error' : 'default'}>{img.path}</Tag>
                  <Text type="secondary" className="text-xs">{formatFileSize(img.size)}</Text>
                  {img.compressedSize && (
                    <Text type="success" strong className="text-xs">→ {formatFileSize(img.compressedSize)} (-{saved}%)</Text>
                  )}
                  {img.status === 'error' && (
                    <Text type="danger" className="text-xs">Lỗi: {img.error}</Text>
                  )}
                </div>
              )
            })}
          </div>
          {doneSize > 0 && (
            <Alert message={`Đã nén: ${formatFileSize(totalSize)} → ${formatFileSize(doneSize)}`} type="success" showIcon className="mt-3" />
          )}
        </Card>
      )}

      {images.length > 0 && (
        <Button type="primary" danger icon={<CompressOutlined />} onClick={startCompress}
          disabled={progress.total > 0 && progress.current < progress.total} size="large" block>
          Nén {images.length} hình (ghi đè tại chỗ)
        </Button>
      )}

      {status && <Alert message={status} type="info" showIcon />}

      {progress.total > 0 && (
        <Progress percent={Math.round((progress.current / progress.total) * 100)} format={() => `${progress.current}/${progress.total}`} />
      )}
    </Space>
  )
}

function RenameSubdirs() {
  const [parentDir, setParentDir] = useState(null)
  const [mode, setMode] = useState('subdirs')
  const [subdirs, setSubdirs] = useState([])
  const [selectedDirs, setSelectedDirs] = useState(new Set())
  const [directImages, setDirectImages] = useState([])
  const [startNum, setStartNum] = useState(1)
  const [renamePattern, setRenamePattern] = useState('{name}({num})')
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [expandedDir, setExpandedDir] = useState(null)
  const [dirImages, setDirImages] = useState({})

  const imageExts = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'])

  const patternPresets = [
    { label: 'Tên(1)', value: '{name}({num})' },
    { label: 'Tên - 1', value: '{name} - {num}' },
    { label: 'Tên ( 1 )', value: '{name} ( {num} )' },
    { label: 'Tên_1', value: '{name}_{num}' },
    { label: '1 - Tên', value: '{num} - {name}' },
    { label: 'Tùy chỉnh', value: '__custom__' },
  ]

  const getNewName = (baseName, num, ext) => {
    return renamePattern.replace(/\{name\}/g, baseName).replace(/\{num\}/g, num) + '.' + ext
  }

  const pickParentFolder = async () => {
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
      setParentDir(dirHandle)
      setStatus(`Đã chọn thư mục: ${dirHandle.name}`)
      setSubdirs([])
      setSelectedDirs(new Set())
      setDirImages({})
      setDirectImages([])
      setExpandedDir(null)
    } catch (err) {
      if (err.name !== 'AbortError') {
        setStatus('Lỗi chọn thư mục: ' + err.message)
      }
    }
  }

  const scanSubdirs = async () => {
    if (!parentDir) return
    setStatus('Đang quét thư mục tổng...')
    const entries = []
    for await (const [name, handle] of parentDir.entries()) {
      entries.push({ name, handle })
    }
    const dirs = entries.filter(e => e.handle.kind === 'directory')
    dirs.sort((a, b) => a.name.localeCompare(b.name))
    setSubdirs(dirs)
    setSelectedDirs(new Set(dirs.map((_, i) => i)))
    setDirImages({})
    setExpandedDir(null)
    setStatus(`Tìm thấy ${dirs.length} thư mục con`)
  }

  const scanDirectImages = async () => {
    if (!parentDir) return
    setStatus('Đang quét ảnh...')
    const entries = []
    for await (const [name, handle] of parentDir.entries()) {
      entries.push({ name, handle })
    }
    const images = entries.filter(e => e.handle.kind === 'file').map(({ name, handle }) => {
      const ext = name.split('.').pop().toLowerCase()
      return { name, handle, ext }
    }).filter(i => imageExts.has(i.ext))
    images.sort((a, b) => a.name.localeCompare(b.name))
    setDirectImages(images)
    setStatus(`Tìm thấy ${images.length} ảnh trong thư mục`)
  }

  const loadImagesForDir = async (index) => {
    const dir = subdirs[index]
    if (!dir) return
    if (dirImages[index]) {
      setExpandedDir(expandedDir === index ? null : index)
      return
    }
    setStatus(`Đang quét ảnh trong "${dir.name}"...`)
    const entries = []
    for await (const [name, handle] of dir.handle.entries()) {
      entries.push({ name, handle })
    }
    const images = entries.filter(e => e.handle.kind === 'file').map(({ name, handle }) => {
      const ext = name.split('.').pop().toLowerCase()
      return { name, handle, ext }
    }).filter(i => imageExts.has(i.ext))
    images.sort((a, b) => a.name.localeCompare(b.name))
    setDirImages(prev => ({ ...prev, [index]: images }))
    setExpandedDir(index)
  }

  const getTotalImages = () => {
    if (mode === 'direct') return directImages.length
    let total = 0
    for (const idx of selectedDirs) {
      const imgs = dirImages[idx]
      if (imgs) total += imgs.length
    }
    return total
  }

  const RENAME_CONCURRENCY = 20

  const startRename = async () => {
    if (!parentDir) return
    if (mode === 'subdirs' && selectedDirs.size === 0) return
    if (mode === 'direct' && directImages.length === 0) return

    if (mode === 'direct') {
      const images = directImages
      setStatus('Đang đổi tên ảnh...')
      setProgress({ current: 0, total: images.length })
      let errors = 0
      let done

      const renameOne = async (img, i) => {
        try {
          const newName = getNewName(parentDir.name, startNum + i, img.ext)
          await img.handle.move(newName)
        } catch {
          errors++
        }
      }

      for (let i = 0; i < images.length; i += RENAME_CONCURRENCY) {
        const batch = images.slice(i, i + RENAME_CONCURRENCY)
        await Promise.all(batch.map((img, j) => renameOne(img, i + j)))
        done = Math.min(i + RENAME_CONCURRENCY, images.length)
        setProgress({ current: done, total: images.length })
        setStatus(`Đang đổi ${done}/${images.length} ảnh...`)
      }

      setStatus(errors ? `Hoàn thành! Đã đổi ${images.length - errors}/${images.length} ảnh (${errors} lỗi).` : `Hoàn thành! Đã đổi tên ${images.length} ảnh.`)
      setProgress({ current: 0, total: 0 })
      await scanDirectImages()
      return
    }

    const dirsToProcess = subdirs.filter((_, i) => selectedDirs.has(i))
    const dirImageMap = []
    let totalImages = 0
    for (const dir of dirsToProcess) {
      const entries = []
      for await (const [name, handle] of dir.handle.entries()) {
        entries.push({ name, handle })
      }
      const images = entries.filter(e => e.handle.kind === 'file').map(({ name, handle }) => {
        const ext = name.split('.').pop().toLowerCase()
        return { name, handle, ext }
      }).filter(i => imageExts.has(i.ext))
      images.sort((a, b) => a.name.localeCompare(b.name))
      dirImageMap.push({ dir, images })
      totalImages += images.length
    }

    setStatus('Đang đổi tên ảnh...')
    setProgress({ current: 0, total: totalImages })

    let done = 0
    let errors = 0
    for (const { dir, images } of dirImageMap) {
      const renameOne = async (img, i) => {
        try {
          const newName = getNewName(dir.name, startNum + i, img.ext)
          await img.handle.move(newName)
        } catch {
          errors++
        }
      }
      for (let i = 0; i < images.length; i += RENAME_CONCURRENCY) {
        const batch = images.slice(i, i + RENAME_CONCURRENCY)
        await Promise.all(batch.map((img, j) => renameOne(img, i + j)))
        done = Math.min(done + batch.length, totalImages)
        setProgress({ current: done, total: totalImages })
        setStatus(`Đang đổi ${done}/${totalImages} ảnh...`)
      }
    }

    setStatus(errors ? `Hoàn thành! Đã đổi ${done - errors}/${done} ảnh (${errors} lỗi).` : `Hoàn thành! Đã đổi tên ${done} ảnh.`)
    setProgress({ current: 0, total: 0 })
    setDirImages({})
    setExpandedDir(null)
  }

  const toggleDir = (index) => {
    const newSet = new Set(selectedDirs)
    if (newSet.has(index)) newSet.delete(index)
    else newSet.add(index)
    setSelectedDirs(newSet)
  }

  return (
    <Space direction="vertical" size="middle" className="w-full">
      <Card title={<Space><FolderOpenOutlined /><Text strong>1. Chọn thư mục</Text></Space>}>
        <Button type="primary" icon={<FolderOpenOutlined />} onClick={pickParentFolder} size="large">
          {parentDir ? `Đã chọn: ${parentDir.name}` : 'Chọn thư mục'}
        </Button>
      </Card>

      {parentDir && (
        <Row gutter={16}>
          <Col span={8}>
            <Card title={<Space><ScissorOutlined /><Text strong>2. Chọn chế độ</Text></Space>} size="small">
              <Radio.Group value={mode} onChange={(e) => { setMode(e.target.value); if (e.target.value === 'subdirs') setDirectImages([]); else setSubdirs([]) }}>
                <Space direction="vertical">
                  <Radio value="subdirs">
                    <Text strong>Nhiều thư mục con</Text>
                    <Text type="secondary" className="ml-2 text-xs">1 thư mục lớn → nhiều thư mục con → ảnh</Text>
                  </Radio>
                  <Radio value="direct">
                    <Text strong>Ảnh trực tiếp</Text>
                    <Text type="secondary" className="ml-2 text-xs">thư mục chứa ảnh, không có thư mục con</Text>
                  </Radio>
                </Space>
              </Radio.Group>
            </Card>
          </Col>
          <Col span={8}>
            <Card title={<Text strong>3. Quét</Text>} size="small">
              {mode === 'subdirs' ? (
                <Button type="primary" ghost icon={<SearchOutlined />} onClick={scanSubdirs} block>
                  Quét thư mục con
                </Button>
              ) : (
                <Button type="primary" ghost icon={<SearchOutlined />} onClick={scanDirectImages} block>
                  Quét ảnh trong thư mục
                </Button>
              )}
            </Card>
          </Col>
          <Col span={8}>
            <Card title={<Text strong>4. Kiểu đặt tên</Text>} size="small">
              <div className="mb-2">
                <Text strong className="block text-xs mb-1">Số bắt đầu</Text>
                <InputNumber min={0} value={startNum} onChange={(v) => setStartNum(v || 0)} className="w-full" />
              </div>
              <div className="mb-2">
                <Text strong className="block text-xs mb-1">Mẫu tên</Text>
                <Select
                  value={patternPresets.find(p => p.value === renamePattern) ? renamePattern : undefined}
                  onChange={(v) => setRenamePattern(v)}
                  style={{ width: '100%' }}
                  className="mb-1"
                  options={patternPresets}
                  placeholder="Chọn mẫu có sẵn"
                />
                <Input
                  value={renamePattern}
                  onChange={(e) => setRenamePattern(e.target.value)}
                  placeholder="{name}({num})"
                />
              </div>
              <Text type="secondary" className="block text-xs">
                Preview: <Text code>{getNewName(parentDir.name, startNum, 'jpg')}</Text>, <Text code>{getNewName(parentDir.name, startNum + 1, 'jpg')}</Text>
              </Text>
              <Text type="secondary" className="block text-xs mt-1">
                {'{name}'}=tên thư mục, {'{num}'}=số thứ tự
              </Text>
            </Card>
          </Col>
        </Row>
      )}

      {mode === 'direct' && directImages.length > 0 && (
        <>
          <Card title={<Space><Text strong>5. Danh sách ảnh ({directImages.length})</Text></Space>}>
            <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-2">
              {directImages.map((img, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2">
                  <Tag color="success">{img.name}</Tag>
                  <Text type="primary">→ {getNewName(parentDir.name, startNum + i, img.ext)}</Text>
                </div>
              ))}
            </div>
          </Card>

          <Button type="primary" danger icon={<ScissorOutlined />} onClick={startRename} size="large" block>
            Đổi tên {directImages.length} ảnh
          </Button>
        </>
      )}

      {mode === 'subdirs' && subdirs.length > 0 && (
        <>

          <Card title={<Space><Text strong>5. Chọn thư mục con cần xử lý</Text></Space>}>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <Text>{selectedDirs.size}/{subdirs.length} thư mục được chọn ({getTotalImages()} ảnh)</Text>
              <Space>
                <Button size="small" onClick={() => setSelectedDirs(new Set(subdirs.map((_, i) => i)))}>Chọn tất cả</Button>
                <Button size="small" onClick={() => setSelectedDirs(new Set())}>Bỏ chọn tất cả</Button>
              </Space>
            </div>
            <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-2">
              {subdirs.map((dir, i) => (
                <div key={i}>
                  <div className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer hover:bg-gray-50 ${selectedDirs.has(i) ? 'bg-blue-50' : ''}`}>
                    <Checkbox checked={selectedDirs.has(i)} onChange={() => toggleDir(i)} />
                    <Tag
                      color="warning"
                      className="cursor-pointer"
                      onClick={(e) => { e.preventDefault(); loadImagesForDir(i) }}
                    >
                      {dir.name}
                    </Tag>
                    {dirImages[i] && (
                      <Text type="secondary" className="text-xs">({dirImages[i].length} ảnh)</Text>
                    )}
                  </div>
                  {expandedDir === i && dirImages[i] && (
                    <div className="ml-8 pl-4 border-l-2 border-gray-200 mb-1">
                      {dirImages[i].length === 0 && (
                        <Text type="secondary" className="block px-2 py-1 text-sm">Không có ảnh</Text>
                      )}
                      {dirImages[i].map((img, j) => (
                        <div key={j} className="flex items-center gap-2 px-2 py-1">
                          <Tag color="success">{img.name}</Tag>
                          <Text type="primary" className="text-sm">→ {getNewName(dir.name, startNum + j, img.ext)}</Text>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Button
            type="primary"
            danger
            icon={<ScissorOutlined />}
            onClick={startRename}
            disabled={selectedDirs.size === 0}
            size="large"
            block
          >
            Đổi tên {getTotalImages()} ảnh trong {selectedDirs.size} thư mục con
          </Button>
        </>
      )}

      {status && <Alert message={status} type="info" showIcon />}

      {progress.total > 0 && (
        <Progress percent={Math.round((progress.current / progress.total) * 100)} format={() => `${progress.current}/${progress.total}`} />
      )}
    </Space>
  )
}


export default App
