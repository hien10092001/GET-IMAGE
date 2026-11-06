import { useEffect, useRef, useState } from 'react'
import { ConfigProvider, Layout, Card, Table, Input, Select, DatePicker, AutoComplete, Tag, Typography, Tabs, Alert, Space, Button, Modal, Image, Spin, Empty } from 'antd'
import { SearchOutlined, ReloadOutlined, EyeOutlined, DownloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../services/api'

const { Header, Content } = Layout
const { Title, Text } = Typography
const { Option } = Select

function PublicLookup() {
  const [type, setType] = useState('containers')
  const [data, setData] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchText, setSearchText] = useState('')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ shippingLine: '', size: '', location: '', remark: '', locked: 'all' })
  const [dateRange, setDateRange] = useState(null)
  const [locationList, setLocationList] = useState([])
  const [remarkList, setRemarkList] = useState([])
  const [imgOpen, setImgOpen] = useState(false)
  const [imgLoading, setImgLoading] = useState(false)
  const [imgFiles, setImgFiles] = useState([])
  const [imgTitle, setImgTitle] = useState('')
  const [imgDate, setImgDate] = useState('')
  const [imgNotice, setImgNotice] = useState('')
  const searchTimerRef = useRef(null)

  useEffect(() => {
    return () => clearTimeout(searchTimerRef.current)
  }, [])

  useEffect(() => {
    api.get('/references/global/location').then(res => setLocationList(res.data?.items || [])).catch(() => {})
    api.get('/references/global/remark').then(res => setRemarkList(res.data?.items || [])).catch(() => {})
  }, [])

  const fetchData = () => {
    setLoading(true)
    setError('')
    const params = { page, limit: pageSize, sort: '-createdAt' }
    if (type === 'containers') params.includeLocks = 1
    if (search) params.search = search
    if (filters.shippingLine) params.shippingLine = filters.shippingLine
    if (filters.size) params.size = filters.size
    if (filters.location) params.location = filters.location
    if (filters.remark) params.remark = filters.remark
    if (filters.locked) params.locked = filters.locked
    if (dateRange && dateRange[0] && dateRange[1]) {
      params.dateFrom = dateRange[0].format('YYYY-MM-DD')
      params.dateTo = dateRange[1].format('YYYY-MM-DD')
    }
    api.get(type === 'containers' ? '/containers' : '/depots', { params })
      .then(res => {
        setData(res.data.data || [])
        setTotal(res.data.total || 0)
      })
      .catch(err => {
        setData([])
        setTotal(0)
        setError(err.response?.data?.message || 'Không tải được dữ liệu. Kiểm tra kết nối tới server.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchData()
  }, [type, page, pageSize, search, filters, dateRange])

  const handleSearchChange = (e) => {
    const val = e.target.value
    setSearchText(val)
    clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setSearch(val)
      setPage(1)
    }, 300)
  }

  const changeFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const openImages = async (record) => {
    const scope = 'containers'
    const date = record.createdAt ? dayjs(record.createdAt).format('YYYY-MM-DD') : ''
    setImgTitle(record.containerNo)
    setImgDate(date)
    setImgOpen(true)
    setImgLoading(true)
    setImgFiles([])
    setImgNotice('')
    try {
      const params = {}
      if (date) params.date = date
      const res = await api.get(`/public-images/${scope}/${record.containerNo}`, { params })
      setImgFiles(res.data.files || [])
      setImgNotice(res.data.message || '')
    } catch (err) {
      setImgNotice(err.response?.data?.message || 'Không tải được hình ảnh')
    } finally {
      setImgLoading(false)
    }
  }

  const imageSrc = (file) => {
    const base = (api.defaults.baseURL || '').replace(/\/+$/, '')
    return file.path.startsWith('http') ? file.path : `${base}${file.path}`
  }

  const downloadUrl = (group) => {
    const base = (api.defaults.baseURL || '').replace(/\/+$/, '')
    const params = new URLSearchParams({ scope: 'containers', containerNo: imgTitle })
    if (imgDate) params.set('date', imgDate)
    if (group) params.set('group', group)
    return `${base}/public-images/download?${params.toString()}`
  }

  const triggerDownload = (group) => {
    const link = document.createElement('a')
    link.href = downloadUrl(group)
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const groupLabel = (group) => {
    const parts = String(group || '').split('/').filter(Boolean)
    const last = parts[parts.length - 1] || ''
    if (parts.length > 1 && last.toUpperCase().includes(imgTitle.toUpperCase())) parts.pop()
    return parts.length ? parts.join(' › ') : 'Hình container'
  }

  const groupedFiles = imgFiles.reduce((acc, file) => {
    const key = file.group || file.folder || 'Khác'
    if (!acc[key]) acc[key] = []
    acc[key].push(file)
    return acc
  }, {})

  const columns = [
    { title: 'Container No', dataIndex: 'containerNo', key: 'containerNo', width: 150, fixed: 'left' },
    { title: 'Hãng tàu', dataIndex: 'shippingLine', key: 'shippingLine', width: 130 },
    { title: 'Size', dataIndex: 'size', key: 'size', width: 80 },
    { title: 'Phân loại', dataIndex: 'location', key: 'location', width: 170 },
    { title: 'Ghi chú', dataIndex: 'remark', key: 'remark', width: 170 },
    { title: 'Bay', dataIndex: 'bay', key: 'bay', width: 100 },
    ...(type === 'containers' ? [{
      title: 'Hình ảnh',
      key: 'images',
      width: 90,
      align: 'center',
      render: (_, record) => <Button type="text" icon={<EyeOutlined />} onClick={() => openImages(record)} />,
    }] : []),
    {
      title: 'Ngày',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 140,
      render: (value) => value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'locked',
      key: 'locked',
      width: 110,
      render: (value) => <Tag color={value ? 'green' : 'default'}>{value ? 'Đã chốt' : 'Chưa chốt'}</Tag>,
    },
  ]

  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#1a73e8', borderRadius: 8 } }}>
      <Layout className="min-h-screen">
        <Header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingInline: 24 }}>
          <Title level={4} style={{ margin: 0 }}>Tra cứu dữ liệu</Title>
          <Text type="secondary">Chế độ chỉ xem</Text>
        </Header>
        <Content style={{ padding: 24 }}>
          <Card>
            <Tabs
              activeKey={type}
              onChange={(key) => { setType(key); setPage(1) }}
              items={[
                { key: 'containers', label: 'Containers' },
                { key: 'depots', label: 'Depot' },
              ]}
            />
            <Space direction="vertical" size="middle" className="w-full">
              {error && <Alert type="error" showIcon message={error} />}
              <Space wrap>
                <Input
                  placeholder="Tìm kiếm container..."
                  prefix={<SearchOutlined />}
                  value={searchText}
                  onChange={handleSearchChange}
                  allowClear
                  onClear={() => { setSearchText(''); setSearch(''); setPage(1) }}
                  style={{ width: 260 }}
                />
                <DatePicker.RangePicker
                  value={dateRange}
                  onChange={(dates) => { setDateRange(dates); setPage(1) }}
                  format="DD/MM/YYYY"
                  placeholder={['Từ ngày', 'Đến ngày']}
                />
                <Input
                  placeholder="Hãng tàu"
                  value={filters.shippingLine}
                  onChange={(e) => changeFilter('shippingLine', e.target.value)}
                  allowClear
                  style={{ width: 140 }}
                />
                <Input
                  placeholder="Size"
                  value={filters.size}
                  onChange={(e) => changeFilter('size', e.target.value.toUpperCase())}
                  allowClear
                  style={{ width: 100 }}
                />
                <AutoComplete
                  placeholder="Phân loại"
                  value={filters.location}
                  options={[...new Set([...locationList, ...(filters.location ? [filters.location] : [])])].map(o => ({ value: o }))}
                  onChange={(v) => changeFilter('location', v)}
                  filterOption={(input, option) => option.value.toUpperCase().includes(input.toUpperCase())}
                  allowClear
                  onClear={() => changeFilter('location', '')}
                  style={{ width: 160 }}
                />
                <AutoComplete
                  placeholder="Ghi chú"
                  value={filters.remark}
                  options={[...new Set([...remarkList, ...(filters.remark ? [filters.remark] : [])])].map(o => ({ value: o }))}
                  onChange={(v) => changeFilter('remark', v ? v.toUpperCase() : '')}
                  filterOption={(input, option) => option.value.toUpperCase().includes(input.toUpperCase())}
                  allowClear
                  onClear={() => changeFilter('remark', '')}
                  style={{ width: 160 }}
                />
                <Select
                  value={filters.locked}
                  onChange={(v) => changeFilter('locked', v)}
                  style={{ width: 130 }}
                >
                  <Option value="all">Tất cả</Option>
                  <Option value="true">Đã chốt</Option>
                  <Option value="false">Chưa chốt</Option>
                </Select>
                <ReloadOutlined onClick={fetchData} style={{ cursor: 'pointer', fontSize: 16 }} />
              </Space>
              <Table
                columns={columns}
                dataSource={data}
                rowKey="_id"
                loading={loading}
                size="middle"
                scroll={{ x: 1100 }}
                pagination={{
                  current: page,
                  pageSize,
                  total,
                  showSizeChanger: true,
                  showTotal: (t) => `Tổng ${t}`,
                  onChange: (p, ps) => { setPage(p); setPageSize(ps) },
                }}
              />
            </Space>
          </Card>
          <Modal
            title={`${imgTitle} - Hình ảnh`}
            open={imgOpen}
            onCancel={() => setImgOpen(false)}
            footer={null}
            width={860}
          >
            <Spin spinning={imgLoading}>
              {imgNotice && <Alert type="info" showIcon message={imgNotice} className="mb-3" />}
              {imgFiles.length > 0 ? (
                <>
                  <div className="flex justify-end mb-3">
                    <Button type="primary" icon={<DownloadOutlined />} onClick={() => triggerDownload()}>
                      Tải tất cả ({imgFiles.length})
                    </Button>
                  </div>
                  {Object.entries(groupedFiles).map(([group, files]) => (
                    <div key={group} className="mb-4">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <Text strong>{groupLabel(group)} <Text type="secondary">({files.length})</Text></Text>
                        <Button size="small" icon={<DownloadOutlined />} onClick={() => triggerDownload(group)}>
                          Tải nhóm
                        </Button>
                      </div>
                      <Image.PreviewGroup>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                          {files.map((file, index) => (
                            <div key={index} className="border rounded p-1">
                              <Image
                                src={imageSrc(file)}
                                alt={file.name}
                                height={120}
                                style={{ objectFit: 'cover', width: '100%' }}
                              />
                              <div className="text-xs text-gray-500 truncate" title={file.name}>{file.name}</div>
                            </div>
                          ))}
                        </div>
                      </Image.PreviewGroup>
                    </div>
                  ))}
                </>
              ) : (!imgLoading && !imgNotice ? <Empty description="Không có hình ảnh" /> : null)}
            </Spin>
          </Modal>
        </Content>
      </Layout>
    </ConfigProvider>
  )
}

export default PublicLookup
