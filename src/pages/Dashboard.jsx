import { useState, useEffect } from 'react'
import { Row, Col, Card, Statistic, Spin, Alert, Table, Tag } from 'antd'
import { ContainerOutlined, CalendarOutlined, FileTextOutlined, LockOutlined } from '@ant-design/icons'
import api from '../services/api'
import dayjs from 'dayjs'

const COLORS = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#eb2f96', '#13c2c2', '#fa8c16', '#2f54eb', '#a0d911']
let Recharts = null

function Dashboard() {
  const [data, setData] = useState(null)
  const [locks, setLocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [chartsReady, setChartsReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.get('/containers/stats/dashboard'),
      api.get('/locks'),
    ]).then(([statsRes, locksRes]) => {
      if (!cancelled) {
        setData(statsRes.data)
        setLocks(locksRes.data)
      }
    }).catch(() => {
      if (!cancelled) setError('Lỗi tải dữ liệu dashboard')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    import('recharts').then(mod => {
      Recharts = mod
      setChartsReady(true)
    })
  }, [])

  if (loading) return <div className="flex justify-center py-20"><Spin size="large" /></div>
  if (error) return <Alert message={error} type="error" showIcon />
  if (!data) return null

  const totalLockedItems = locks.reduce((s, l) => s + (l.items?.length || 0), 0)

  const lockColumns = [
    { title: 'Ngày', dataIndex: 'date', key: 'date', width: 110, render: v => dayjs(v).format('DD/MM/YYYY') },
    { title: 'Ca', dataIndex: 'shift', key: 'shift', width: 60, render: v => <Tag color={v === 'sáng' ? 'orange' : 'blue'}>{v}</Tag> },
    { title: 'Số lượng', key: 'count', width: 80, render: (_, r) => r.items?.length || 0 },
    { title: 'Người chốt', dataIndex: 'createdBy', key: 'createdBy', width: 100 },
    { title: 'Thời gian', dataIndex: 'createdAt', key: 'createdAt', width: 130, render: v => dayjs(v).format('DD/MM/YYYY HH:mm') },
  ]

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6} md={6}>
          <Card className="shadow-sm">
            <Statistic
              title="Tổng Container"
              value={data.totalContainers}
              prefix={<ContainerOutlined />}
              valueStyle={{ color: '#1890ff', fontSize: 28 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={6}>
          <Card className="shadow-sm">
            <Statistic
              title="Hôm nay"
              value={data.todayContainers}
              prefix={<CalendarOutlined />}
              valueStyle={{ color: '#722ed1', fontSize: 28 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={6}>
          <Card className="shadow-sm">
            <Statistic
              title="Tháng này"
              value={data.monthContainers}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: '#eb2f96', fontSize: 28 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={6}>
          <Card className="shadow-sm">
            <Statistic
              title="Tổng sản lượng đã chốt"
              value={totalLockedItems}
              prefix={<LockOutlined />}
              valueStyle={{ color: '#13c2c2', fontSize: 28 }}
            />
          </Card>
        </Col>
      </Row>

      {!chartsReady ? (
        <div className="flex justify-center py-10"><Spin /></div>
      ) : (
        <>
          <Row gutter={[16, 16]} className="mt-4">
            <Col xs={24} lg={14}>
              <Card title="Sản lượng theo ngày (Tháng này)" className="shadow-sm">
                <Recharts.ResponsiveContainer width="100%" height={320}>
                  <Recharts.BarChart data={data.byDay} margin={{ top: 8, right: 8, left: -8, bottom: 8 }}>
                    <Recharts.CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <Recharts.XAxis dataKey="_id" tick={{ fontSize: 11 }} />
                    <Recharts.YAxis allowDecimals={false} />
                    <Recharts.Tooltip />
                    <Recharts.Bar dataKey="total" fill="#1890ff" name="Tổng" radius={[4, 4, 0, 0]} />
                  </Recharts.BarChart>
                </Recharts.ResponsiveContainer>
              </Card>
            </Col>
            <Col xs={24} lg={10}>
              <Card title="Sản lượng theo hãng tàu (Top 10)" className="shadow-sm">
                <Recharts.ResponsiveContainer width="100%" height={320}>
                  <Recharts.BarChart data={data.byShippingLine} layout="vertical" margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <Recharts.CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <Recharts.XAxis type="number" allowDecimals={false} />
                    <Recharts.YAxis dataKey="_id" type="category" tick={{ fontSize: 11 }} width={90} />
                    <Recharts.Tooltip />
                    <Recharts.Bar dataKey="total" fill="#13c2c2" name="Tổng" radius={[0, 4, 4, 0]} />
                  </Recharts.BarChart>
                </Recharts.ResponsiveContainer>
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} className="mt-4">
            <Col xs={24} lg={12}>
              <Card title="Sản lượng theo tháng" className="shadow-sm">
                <Recharts.ResponsiveContainer width="100%" height={300}>
                  <Recharts.LineChart data={data.byMonth} margin={{ top: 8, right: 8, left: -8, bottom: 8 }}>
                    <Recharts.CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <Recharts.XAxis dataKey="_id" tick={{ fontSize: 11 }} />
                    <Recharts.YAxis allowDecimals={false} />
                    <Recharts.Tooltip />
                    <Recharts.Line type="monotone" dataKey="total" stroke="#722ed1" strokeWidth={2} name="Tổng" dot={{ fill: '#722ed1', r: 4 }} />
                  </Recharts.LineChart>
                </Recharts.ResponsiveContainer>
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="Sản lượng theo Size" className="shadow-sm">
                <Recharts.ResponsiveContainer width="100%" height={300}>
                  <Recharts.PieChart>
                    <Recharts.Pie data={data.bySize} dataKey="total" nameKey="_id" cx="50%" cy="50%" outerRadius={90} innerRadius={45} label={({ _id, total }) => `${_id}: ${total}`}>
                      {data.bySize.map((_, i) => (
                        <Recharts.Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Recharts.Pie>
                    <Recharts.Tooltip />
                    <Recharts.Legend />
                  </Recharts.PieChart>
                </Recharts.ResponsiveContainer>
              </Card>
            </Col>
          </Row>
        </>
      )}

      <Card title="Sản lượng đã chốt (gần nhất)" className="mt-4 shadow-sm">
        <Table
          columns={lockColumns}
          dataSource={locks.slice(0, 10)}
          rowKey="_id"
          pagination={false}
          size="small"
          scroll={{ x: 500 }}
        />
      </Card>
    </div>
  )
}

export default Dashboard
