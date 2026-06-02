import { useState } from 'react'
import * as XLSX from 'xlsx'
import { Table, Tag, Button, Card, Progress, Alert, Upload, Radio, Space, Typography, Row, Col, Divider } from 'antd'
import { FolderOpenOutlined, FileExcelOutlined, CopyOutlined, SearchOutlined, ScissorOutlined, UploadOutlined } from '@ant-design/icons'

const { Dragger } = Upload
const { Title, Text } = Typography

async function copyDirectoryContents(srcDirHandle, destDirHandle) {
  for await (const [name, handle] of srcDirHandle.entries()) {
    if (handle.kind === 'file') {
      const file = await handle.getFile()
      const newFileHandle = await destDirHandle.getFileHandle(name, { create: true })
      const writable = await newFileHandle.createWritable()
      await writable.write(file)
      await writable.close()
    } else if (handle.kind === 'directory') {
      const newDirHandle = await destDirHandle.getDirectoryHandle(name, { create: true })
      await copyDirectoryContents(handle, newDirHandle)
    }
  }
}

function isValidISO(name) {
  return /^[A-Z]{4}\d{7}$/.test(name)
}

function getDestSuffix(source, phanLoai) {
  if (source === 'IN' && (phanLoai === 'IN-HU' || phanLoai === 'IN-VS')) {
    return phanLoai
  }
  return source
}

function SubfolderExtractor() {
  const [inDir, setInDir] = useState(null)
  const [scvsDir, setScvsDir] = useState(null)
  const [destDir, setDestDir] = useState(null)
  const [excelData, setExcelData] = useState([])
  const [scvsExcelData, setScvsExcelData] = useState([])
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [scanned, setScanned] = useState(null)
  const [summary, setSummary] = useState(null)
  const [copying, setCopying] = useState(false)
  const [scanMode, setScanMode] = useState('both')

  const pickFolder = (setter, label) => async () => {
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
      setter(dirHandle)
      setScanned(null)
      setSummary(null)
      setStatus(`Đã chọn thư mục ${label}: ${dirHandle.name}`)
    } catch (err) {
      if (err.name !== 'AbortError') {
        setStatus('Lỗi chọn thư mục: ' + err.message)
      }
    }
  }

  const handleExcelUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setScanned(null)
    setSummary(null)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const buffer = evt.target.result
        const workbook = XLSX.read(buffer, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 })

        const containers = []
        for (const row of rawData) {
          const cont = row[0]
          if (!cont || !String(cont).trim()) continue
          const raw = String(cont).trim()
          const num = raw.toUpperCase()
          if (num.length < 4 || num.length > 15) continue
          if (/[^A-Z0-9-]/.test(num)) continue
          containers.push({
            soContainer: num,
            hangTau: row[1] ? String(row[1]).trim().toUpperCase() : '',
            phanLoai: row[2] ? String(row[2]).trim().toUpperCase() : ''
          })
        }

        setExcelData(containers)
        setStatus(`Đã đọc ${containers.length} container từ Excel IN`)
      } catch (err) {
        setStatus('Lỗi đọc Excel: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const handleScvsExcelUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setScanned(null)
    setSummary(null)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const buffer = evt.target.result
        const workbook = XLSX.read(buffer, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 })

        const containers = []
        for (const row of rawData) {
          const cont = row[0]
          if (!cont || !String(cont).trim()) continue
          const raw = String(cont).trim()
          const num = raw.toUpperCase()
          if (num.length < 4 || num.length > 15) continue
          if (/[^A-Z0-9-]/.test(num)) continue
          containers.push({
            soContainer: num,
            hangTau: row[1] ? String(row[1]).trim().toUpperCase() : '',
            phanLoai: row[2] ? String(row[2]).trim().toUpperCase() : 'SC'
          })
        }

        setScvsExcelData(containers)
        setStatus(`Đã đọc ${containers.length} container từ Excel SC/VS`)
      } catch (err) {
        setStatus('Lỗi đọc Excel SC/VS: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const scanSources = async () => {
    if (scanMode === 'both' && (!inDir || !scvsDir || excelData.length === 0 || scvsExcelData.length === 0)) return
    if (scanMode === 'in' && (!inDir || excelData.length === 0)) return
    if (scanMode === 'scvs' && (!scvsDir || scvsExcelData.length === 0)) return

    setStatus('Đang quét thư mục con...')
    setScanned(null)
    setSummary(null)

    const inContMap = new Map()
    for (const c of excelData) {
      inContMap.set(c.soContainer, c)
    }

    const scvsContMap = new Map()
    for (const c of scvsExcelData) {
      scvsContMap.set(c.soContainer, c)
    }

    const matched = []
    const isoItems = []
    const foundInIN = new Set()
    const foundInSCVS = new Set()

    try {
      if (scanMode === 'both' || scanMode === 'in') {
        for await (const [name, handle] of inDir.entries()) {
          if (handle.kind !== 'directory') continue
          const nameUpper = name.toUpperCase()
          if (!inContMap.has(nameUpper)) continue
          const info = inContMap.get(nameUpper)
          foundInIN.add(nameUpper)
          if (isValidISO(nameUpper)) {
            const destSuffix = getDestSuffix('IN', info.phanLoai)
            matched.push({ name, handle, source: 'IN', info, destSuffix })
          } else {
            isoItems.push({ name, handle, source: 'IN', info })
          }
        }
      }

      if (scanMode === 'both' || scanMode === 'scvs') {
        for await (const [name, handle] of scvsDir.entries()) {
          if (handle.kind !== 'directory') continue
          const nameUpper = name.toUpperCase()
          if (!scvsContMap.has(nameUpper)) continue
          const info = scvsContMap.get(nameUpper)
          foundInSCVS.add(nameUpper)
          const source = (info.phanLoai === 'SC' || info.phanLoai === 'VS') ? info.phanLoai : 'SC'
          if (isValidISO(nameUpper)) {
            const destSuffix = getDestSuffix(source, info.phanLoai)
            matched.push({ name, handle, source, info, destSuffix })
          } else {
            isoItems.push({ name, handle, source, info })
          }
        }
      }

      const notFoundBySource = { IN: [], 'SC/VS': [] }
      if (scanMode === 'both' || scanMode === 'in') {
        for (const c of excelData) {
          if (!foundInIN.has(c.soContainer)) notFoundBySource.IN.push(c)
        }
      }
      if (scanMode === 'both' || scanMode === 'scvs') {
        for (const c of scvsExcelData) {
          if (!foundInSCVS.has(c.soContainer)) notFoundBySource['SC/VS'].push(c)
        }
      }

      const countMap = {}
      for (const item of matched) {
        const key = `${item.info.hangTau || 'KHONGMA'}-${item.destSuffix}`
        countMap[key] = (countMap[key] || 0) + 1
      }
      for (const item of isoItems) {
        const key = `${item.info.hangTau || 'KHONGMA'}-ISO`
        countMap[key] = (countMap[key] || 0) + 1
      }
      const detail = Object.entries(countMap)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} (${v})`)
        .join(', ')

      const inCount = matched.filter(i => i.source === 'IN').length + isoItems.filter(i => i.source === 'IN').length
      const scvsCount = matched.filter(i => i.source !== 'IN').length + isoItems.filter(i => i.source !== 'IN').length

      let statusMsg = 'Đã quét xong!'
      if (scanMode === 'both') statusMsg += ` IN: ${inCount}, SC/VS: ${scvsCount}`
      else if (scanMode === 'in') statusMsg += ` IN: ${inCount}`
      else if (scanMode === 'scvs') statusMsg += ` SC/VS: ${scvsCount}`
      statusMsg += ` (${matched.length} chuẩn + ${isoItems.length} ISO). Nhấn "Copy" để bắt đầu.`

      setScanned({
        items: matched, isoItems,
        total: matched.length + isoItems.length,
        detail, countMap, notFound: notFoundBySource,
        inCount, scvsCount
      })
      setStatus(statusMsg)
    } catch (err) {
      setStatus('Lỗi quét: ' + err.message)
    }
  }

  const copyOneItem = async (item, parentName) => {
    let parentDir
    try {
      parentDir = await destDir.getDirectoryHandle(parentName)
    } catch {
      parentDir = await destDir.getDirectoryHandle(parentName, { create: true })
    }
    const childDir = await parentDir.getDirectoryHandle(item.name, { create: true })
    await copyDirectoryContents(item.handle, childDir)
  }

  const startCopy = async () => {
    if (!scanned || !destDir) return

    setCopying(true)
    setSummary(null)
    const allItems = [
      ...scanned.items.map(i => ({ ...i, parentName: `${i.info.hangTau || 'KHONGMA'}-${i.destSuffix}` })),
      ...scanned.isoItems.map(i => ({ ...i, parentName: `${i.info.hangTau || 'KHONGMA'}-ISO` }))
    ]
    setProgress({ current: 0, total: allItems.length })

    try {
      for (let i = 0; i < allItems.length; i++) {
        const item = allItems[i]
        setProgress({ current: i + 1, total: allItems.length })
        setStatus(`Đang copy ${i + 1}/${allItems.length}: ${item.name} → ${item.parentName}`)
        await copyOneItem(item, item.parentName)
      }

      setSummary({
        total: allItems.length,
        detail: scanned.detail,
        items: scanned.items,
        isoItems: scanned.isoItems,
        notFound: scanned.notFound
      })
      setStatus(`Hoàn thành! Đã tách ${allItems.length} container: ${scanned.detail}`)
    } catch (err) {
      setStatus('Lỗi copy: ' + err.message)
    }
    setCopying(false)
  }

  return (
    <Space direction="vertical" size="middle" className="w-full">
      <Row gutter={16}>
        <Col span={12}>
          <Card title={<Space><FileExcelOutlined /><Text strong>1. Upload Excel IN</Text></Space>} className="h-full">
            <Dragger
              accept=".xlsx,.xls,.csv"
              beforeUpload={(f) => { handleExcelUpload({ target: { files: [f] } }); return false }}
              showUploadList={false}
            >
              <p className="ant-upload-drag-icon"><UploadOutlined /></p>
              <p className="ant-upload-text">Click hoặc kéo thả</p>
              <p className="ant-upload-hint">.xlsx, .xls, .csv</p>
            </Dragger>
            {excelData.length > 0 && (
              <div className="mt-3">
                <Text strong className="mb-2 block">Đã đọc {excelData.length} container IN:</Text>
                <Table
                  dataSource={excelData.map((c, i) => ({ ...c, key: i }))}
                  columns={[
                    { title: 'STT', dataIndex: 'key', key: 'stt', width: 60, render: (v) => v + 1 },
                    { title: 'Số Container', dataIndex: 'soContainer', key: 'soContainer',
                      render: (v) => <Tag color="blue">{v}</Tag>
                    },
                    { title: 'Hãng tàu', dataIndex: 'hangTau', key: 'hangTau' },
                    {
                      title: 'Phân loại', dataIndex: 'phanLoai', key: 'phanLoai',
                      render: (v) => {
                        if (v === 'IN-HU') return <Tag color="orange">IN-HU</Tag>
                        if (v === 'IN-VS') return <Tag color="purple">IN-VS</Tag>
                        if (v === 'SC') return <Tag color="cyan">SC</Tag>
                        if (v === 'VS') return <Tag color="green">VS</Tag>
                        return v || <span style={{ color: '#999' }}>—</span>
                      }
                    },
                  ]}
                  pagination={{ pageSize: 5, showSizeChanger: false }}
                  size="small"
                  bordered
                  scroll={{ x: 400 }}
                />
              </div>
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card title={<Space><FileExcelOutlined /><Text strong>2. Upload Excel SC/VS riêng</Text></Space>} className="h-full">
            <Dragger
              accept=".xlsx,.xls,.csv"
              beforeUpload={(f) => { handleScvsExcelUpload({ target: { files: [f] } }); return false }}
              showUploadList={false}
            >
              <p className="ant-upload-drag-icon"><UploadOutlined /></p>
              <p className="ant-upload-text">Click hoặc kéo thả</p>
              <p className="ant-upload-hint">.xlsx, .xls, .csv</p>
            </Dragger>
            {scvsExcelData.length > 0 && (
              <div className="mt-3">
                <Text strong className="mb-2 block">Đã đọc {scvsExcelData.length} container SC/VS:</Text>
                <Table
                  dataSource={scvsExcelData.map((c, i) => ({ ...c, key: i }))}
                  columns={[
                    { title: 'STT', dataIndex: 'key', key: 'stt', width: 60, render: (v) => v + 1 },
                    { title: 'Số Container', dataIndex: 'soContainer', key: 'soContainer',
                      render: (v) => <Tag color="blue">{v}</Tag>
                    },
                    { title: 'Hãng tàu', dataIndex: 'hangTau', key: 'hangTau' },
                    {
                      title: 'Phân loại', dataIndex: 'phanLoai', key: 'phanLoai',
                      render: (v) => {
                        if (v === 'SC') return <Tag color="cyan">SC</Tag>
                        if (v === 'VS') return <Tag color="green">VS</Tag>
                        return v || <Tag color="cyan">SC (mặc định)</Tag>
                      }
                    },
                  ]}
                  pagination={{ pageSize: 5, showSizeChanger: false }}
                  size="small"
                  bordered
                  scroll={{ x: 400 }}
                />
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title={<Space><FolderOpenOutlined /><Text strong>3. Chọn thư mục nguồn</Text></Space>} className="h-full">
            <Text type="secondary" className="block mb-3">
              <Tag color="blue">Excel IN</Tag> → tìm trong thư mục <Tag color="blue">IN</Tag> &nbsp;
              <Tag color="cyan">Excel SC/VS</Tag> → tìm trong thư mục <Tag color="cyan">SC/VS</Tag>
            </Text>
            <Space size="middle">
              <Button type="primary" icon={<FolderOpenOutlined />} onClick={pickFolder(setInDir, 'IN')} size="large">
                {inDir ? `IN: ${inDir.name}` : 'Chọn thư mục IN'}
              </Button>
              <Button type="primary" ghost icon={<FolderOpenOutlined />} onClick={pickFolder(setScvsDir, 'SC/VS')} size="large">
                {scvsDir ? `SC/VS: ${scvsDir.name}` : 'Chọn thư mục SC/VS'}
              </Button>
            </Space>
            {inDir && scvsDir && (
              <Alert message="Đã chọn đủ 2 thư mục nguồn" type="success" showIcon className="mt-3" />
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card title={<Space><FolderOpenOutlined /><Text strong>4. Chọn thư mục đích</Text></Space>} className="h-full">
            <Button type="primary" icon={<FolderOpenOutlined />} onClick={pickFolder(setDestDir, 'đích')} size="large">
              {destDir ? `Đã chọn: ${destDir.name}` : 'Chọn thư mục đích'}
            </Button>
          </Card>
        </Col>
      </Row>

      <Card title={<Space><ScissorOutlined /><Text strong>5. Quét & Tách folder con</Text></Space>}>
        <div className="bg-gray-50 p-3 rounded-lg mb-4 font-mono text-sm leading-relaxed">
          {destDir ? `${destDir.name}/` : 'ĐÍCH/'}<Text className="text-orange-600">HÃNGTÀU-IN-HU</Text>/<Text className="text-green-700">TÊN_CONT</Text>/ <Text type="secondary" italic>p.loại IN-HU</Text><br />
          {destDir ? `${destDir.name}/` : 'ĐÍCH/'}<Text className="text-purple-600">HÃNGTÀU-IN-VS</Text>/<Text className="text-green-700">TÊN_CONT</Text>/ <Text type="secondary" italic>p.loại IN-VS</Text><br />
          {destDir ? `${destDir.name}/` : 'ĐÍCH/'}<Text className="text-cyan-700">HÃNGTÀU-SC</Text>/<Text className="text-green-700">TÊN_CONT</Text>/ <Text type="secondary" italic>p.loại SC</Text><br />
          {destDir ? `${destDir.name}/` : 'ĐÍCH/'}<Text className="text-green-700">HÃNGTÀU-VS</Text>/<Text className="text-green-700">TÊN_CONT</Text>/ <Text type="secondary" italic>p.loại VS</Text><br />
          {destDir ? `${destDir.name}/` : 'ĐÍCH/'}<Text className="text-red-600">HÃNGTÀU-ISO</Text>/<Text className="text-green-700">TÊN_CONT</Text>/ <Text type="secondary" italic>tên folder không đúng ISO</Text>
        </div>
        <div className="mb-4">
          <Radio.Group value={scanMode} onChange={(e) => { setScanMode(e.target.value); setScanned(null); setSummary(null) }} optionType="button" buttonStyle="solid">
            <Radio.Button value="both">Cả IN và SC/VS</Radio.Button>
            <Radio.Button value="in">Chỉ IN</Radio.Button>
            <Radio.Button value="scvs">Chỉ SC/VS</Radio.Button>
          </Radio.Group>
        </div>
        <Space size="middle">
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={scanSources}
            disabled={
              (scanMode === 'both' && (!inDir || !scvsDir || excelData.length === 0 || scvsExcelData.length === 0)) ||
              (scanMode === 'in' && (!inDir || excelData.length === 0)) ||
              (scanMode === 'scvs' && (!scvsDir || scvsExcelData.length === 0))
            }
            size="large"
          >
            Quét thư mục con
          </Button>
          <Button
            type="primary"
            danger
            icon={<CopyOutlined />}
            onClick={startCopy}
            disabled={!scanned || copying}
            size="large"
          >
            {copying ? 'Đang copy...' : `Copy ${scanned ? scanned.total : 0} container vào đích`}
          </Button>
        </Space>
      </Card>

      {scanned && !summary && (
        <Space direction="vertical" size="middle" className="w-full">
          {scanned.items.length > 0 && (
            <Card title={<Space><Text strong>Container chuẩn ({scanned.items.length})</Text></Space>} className="border-l-4 border-blue-500">
              <Text type="primary" strong className="block mb-3">{scanned.detail}</Text>
              <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-2">
                {scanned.items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded bg-blue-50 mb-1">
                    <Tag color="warning">{item.name}</Tag>
                    <Text className="text-sm">
                      <Text strong>{item.source}</Text>
                      {item.info.phanLoai ? ` (${item.info.phanLoai})` : ''}
                      <Text type="primary"> → {item.info.hangTau || 'KHONGMA'}-{item.destSuffix}</Text>
                    </Text>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {scanned.isoItems.length > 0 && (
            <Card title={<Space><Text type="danger">Container ISO (sai định dạng) — {scanned.isoItems.length}</Text></Space>} className="border-l-4 border-red-500">
              <Alert message="Các folder này không đúng định dạng số container ISO (4 chữ + 7 số) → sẽ copy vào HÃNGTÀU-ISO" type="warning" showIcon className="mb-3" />
              <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-2">
                {scanned.isoItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded bg-red-50 mb-1">
                    <Tag color="warning">{item.name}</Tag>
                    <Text className="text-sm">
                      <Text strong>{item.source}</Text>
                      {item.info.phanLoai ? ` (${item.info.phanLoai})` : ''}
                      <Text type="danger"> → {item.info.hangTau || 'KHONGMA'}-ISO</Text>
                    </Text>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {scanned.notFound && (
            (scanMode === 'both' && (scanned.notFound.IN.length > 0 || scanned.notFound['SC/VS'].length > 0)) ||
            (scanMode === 'in' && scanned.notFound.IN.length > 0) ||
            (scanMode === 'scvs' && scanned.notFound['SC/VS'].length > 0)
          ) && (
            <Card title={<Text type="warning">Container không có thư mục tương ứng</Text>} className="border-l-4 border-orange-400">
              <Row gutter={16}>
                {(scanMode === 'both' ? ['IN', 'SC/VS'] : scanMode === 'in' ? ['IN'] : ['SC/VS']).map(src => (
                  <Col span={12} key={src}>
                    <div className="mb-2">
                      <Text strong type="warning">{src} thiếu ({scanned.notFound[src].length})</Text>
                    </div>
                    {scanned.notFound[src].length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {scanned.notFound[src].map((c, i) => (
                          <Tag key={i} color="orange">{c.soContainer}{c.hangTau ? ` (${c.hangTau})` : ''}</Tag>
                        ))}
                      </div>
                    ) : (
                      <Text type="success" italic>Đã đủ</Text>
                    )}
                  </Col>
                ))}
              </Row>
            </Card>
          )}
        </Space>
      )}

      {summary && (
        <Space direction="vertical" size="middle" className="w-full">
          <Card className="border-l-4 border-green-500 bg-green-50">
            <Title level={4} className="text-green-700">Đã tách {summary.total} container</Title>
            <Text type="success" strong>{summary.detail}</Text>
            <Divider />
            <details>
              <summary className="cursor-pointer text-blue-600 font-semibold">Xem chi tiết</summary>
              <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-2 mt-2">
                {summary.items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded bg-green-50 mb-1">
                    <Tag color="warning">{item.name}</Tag>
                    <Text className="text-sm">← <Text strong>{item.source}</Text> → {item.info.hangTau || 'KHONGMA'}-{item.destSuffix}/{item.name}</Text>
                  </div>
                ))}
                {summary.isoItems.map((item, i) => (
                  <div key={'iso-' + i} className="flex items-center gap-2 px-3 py-2 rounded bg-red-50 mb-1 border-l-4 border-red-500">
                    <Tag color="warning">{item.name}</Tag>
                    <Text className="text-sm">← <Text strong>{item.source}</Text> → {item.info.hangTau || 'KHONGMA'}-ISO/{item.name}</Text>
                  </div>
                ))}
              </div>
            </details>
          </Card>
          {summary.notFound && (
            (scanMode === 'both' && (summary.notFound.IN.length > 0 || summary.notFound['SC/VS'].length > 0)) ||
            (scanMode === 'in' && summary.notFound.IN.length > 0) ||
            (scanMode === 'scvs' && summary.notFound['SC/VS'].length > 0)
          ) && (
            <Card title={<Text type="warning">Container không có thư mục tương ứng</Text>} className="border-l-4 border-orange-400">
              <Row gutter={16}>
                {(scanMode === 'both' ? ['IN', 'SC/VS'] : scanMode === 'in' ? ['IN'] : ['SC/VS']).map(src => (
                  <Col span={12} key={src}>
                    <div className="mb-2">
                      <Text strong type="warning">{src} thiếu ({summary.notFound[src].length})</Text>
                    </div>
                    {summary.notFound[src].length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {summary.notFound[src].map((c, i) => (
                          <Tag key={i} color="orange">{c.soContainer}{c.hangTau ? ` (${c.hangTau})` : ''}</Tag>
                        ))}
                      </div>
                    ) : (
                      <Text type="success" italic>Đã đủ</Text>
                    )}
                  </Col>
                ))}
              </Row>
            </Card>
          )}
        </Space>
      )}

      {(status && !scanned && !summary) || (status && copying) ? (
        <Alert message={status} type="info" showIcon />
      ) : null}

      {progress.total > 0 && (
        <Progress percent={Math.round((progress.current / progress.total) * 100)} format={() => `${progress.current}/${progress.total}`} />
      )}
    </Space>
  )
}

export default SubfolderExtractor
