import { useState, useEffect, useMemo } from 'react'
import { Row, Col, Card, Statistic, Alert, Table, Tag, Tabs } from 'antd'
import { ContainerOutlined, CalendarOutlined, FileTextOutlined, LockOutlined, RiseOutlined, FallOutlined, MinusOutlined, BarChartOutlined, TableOutlined, ExperimentOutlined, SwapOutlined } from '@ant-design/icons'
import api from '../services/api'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'

dayjs.extend(isoWeek)

const COLORS = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#eb2f96', '#13c2c2', '#fa8c16', '#2f54eb', '#a0d911']
let Recharts = null

function formatNumber(n) {
  return (n ?? 0).toLocaleString('vi-VN')
}

function Delta({ value }) {
  if (value > 0) return <span style={{ color: '#52c41a', fontSize: 13 }}><RiseOutlined /> +{value}%</span>
  if (value < 0) return <span style={{ color: '#f5222d', fontSize: 13 }}><FallOutlined /> {value}%</span>
  return <span style={{ color: '#999', fontSize: 13 }}><MinusOutlined /> 0%</span>
}

function Dashboard() {
  const [containerData, setContainerData] = useState(null)
  const [lockData, setLockData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [chartsReady, setChartsReady] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get('/containers/stats/dashboard').then(r => r.data),
      api.get('/locks/stats/dashboard').then(r => r.data),
    ]).then(([cStats, lStats]) => {
      setContainerData(cStats)
      setLockData(lStats)
    }).catch(() => {
      setError('Lỗi tải dữ liệu dashboard')
    }).finally(() => {
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    import('recharts').then(mod => {
      Recharts = mod
      setChartsReady(true)
    }).catch(() => setChartsReady(true))
  }, [])

  const lockRate = useMemo(() => {
    if (!containerData || !lockData) return 0
    const total = containerData.totalContainers || 0
    return total > 0 ? Math.round((lockData.totalLockedItems / total) * 100) : 0
  }, [containerData, lockData])

  const todayPct = useMemo(() => {
    if (!containerData) return 0
    return containerData.yesterdayContainers > 0
      ? Math.round(((containerData.todayContainers - containerData.yesterdayContainers) / containerData.yesterdayContainers) * 100)
      : containerData.todayContainers > 0 ? 100 : 0
  }, [containerData])

  const monthPct = useMemo(() => {
    if (!containerData) return 0
    return containerData.lastMonthContainers > 0
      ? Math.round(((containerData.monthContainers - containerData.lastMonthContainers) / containerData.lastMonthContainers) * 100)
      : containerData.monthContainers > 0 ? 100 : 0
  }, [containerData])

  const todayLockPct = useMemo(() => {
    if (!lockData || !containerData) return 0
    const total = containerData.todayContainers
    return total > 0 ? Math.round((lockData.todayLockedItems / total) * 100) : 0
  }, [lockData, containerData])

  const dailyAvgLock = useMemo(() => {
    if (!lockData?.byDay?.length) return 0
    return Math.round(lockData.monthLockedItems / lockData.byDay.length)
  }, [lockData])

  const byWeekData = useMemo(() => (lockData?.byWeek || []).slice(), [lockData])
  const byMonthData = useMemo(() => (lockData?.byMonth || []).slice(), [lockData])
  const byDayData = useMemo(() => (lockData?.byDay || []).slice(), [lockData])
  const byShiftData = useMemo(() => (lockData?.byShift || []), [lockData])
  const byShippingLineData = useMemo(() => (lockData?.byShippingLine || []), [lockData])

  const lockTableColumns = [
    { title: 'Ngày', dataIndex: 'date', key: 'date', width: 110, render: v => dayjs(v).format('DD/MM/YYYY') },
    { title: 'Ca', dataIndex: 'shift', key: 'shift', width: 60, render: v => <Tag color={v === 'sáng' ? 'orange' : 'blue'}>{v === 'sáng' ? 'Sáng' : 'Tối'}</Tag> },
    { title: 'SL chốt', key: 'count', width: 80, render: (_, r) => <span className="font-semibold text-blue-600">{formatNumber(r.items?.length || 0)}</span> },
    { title: 'Container', key: 'containerTotal', width: 90, render: (_, r) => {
      if (!containerData?.dailyDetail) return null
      const day = containerData.dailyDetail.find(d => d.date === r.date)
      return day ? <span className="text-orange-600">{formatNumber(day.total)}</span> : '-'
    }},
    { title: 'Tỉ lệ', key: 'rate', width: 80, render: (_, r) => {
      if (!containerData?.dailyDetail) return null
      const day = containerData.dailyDetail.find(d => d.date === r.date)
      const total = day?.total || 0
      const locked = r.items?.length || 0
      if (total === 0) return '-'
      return <Tag color={locked / total >= 0.8 ? 'green' : locked / total >= 0.5 ? 'orange' : 'red'}>{Math.round(locked / total * 100)}%</Tag>
    }},
  ]

  const dailyColumns = [
    { title: 'Ngày', dataIndex: 'date', key: 'date', width: 110, render: v => dayjs(v).format('DD/MM/YYYY') },
    { title: 'SL chốt', dataIndex: 'total', key: 'total', width: 90, render: v => <span className="font-semibold text-blue-600">{formatNumber(v)}</span> },
    {
      title: 'Hãng tàu', dataIndex: 'shippingLines', key: 'shippingLines',
      render: lines => lines?.slice(0, 5).map((l, i) => (
        <Tag key={i} color={COLORS[i % COLORS.length]} className="mb-1">{l.name || '(trống)'}: {l.count}</Tag>
      )),
    },
  ]

  const weeklyColumns = [
    { title: 'Tuần', dataIndex: 'label', key: 'label', width: 80 },
    { title: 'SL chốt', dataIndex: 'total', key: 'total', width: 90, render: v => <span className="font-semibold text-blue-600">{formatNumber(v)}</span> },
    { title: 'TB/ngày', key: 'avg', width: 80, render: (_, r) => formatNumber(Math.round(r.total / 7)) },
  ]

  const monthlyColumns = [
    { title: 'Tháng', dataIndex: '_id', key: '_id', width: 80 },
    { title: 'SL chốt', dataIndex: 'total', key: 'total', width: 90, render: v => <span className="font-semibold text-blue-600">{formatNumber(v)}</span> },
    { title: 'TB/ngày', key: 'avg', width: 80, render: (_, r) => formatNumber(Math.round(r.total / dayjs(r._id, 'YYYY-MM').daysInMonth())) },
  ]

  function renderChartRow() {
    if (!chartsReady || !Recharts) return null
    const { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } = Recharts
    return (
      <Row gutter={[12, 12]} className="mt-4">
        <Col xs={24} lg={10}>
          <Card title={<span><CalendarOutlined /> Sản lượng chốt theo ngày (Tháng {dayjs().format('MM/YYYY')})</span>} className="shadow-sm" size="small">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={byDayData} margin={{ top: 8, right: 8, left: -8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="_id" tick={{ fontSize: 11 }} tickFormatter={v => dayjs(v).format('DD')} />
                <YAxis allowDecimals={false} />
                <Tooltip labelFormatter={v => dayjs(v).format('DD/MM/YYYY')} />
                <Bar dataKey="total" fill="#13c2c2" name="SL chốt" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={12} lg={4}>
          <Card title={<span><SwapOutlined /> Sản lượng theo ca</span>} className="shadow-sm" size="small" style={{ height: '100%' }}>
            {byShiftData.map(s => (
              <div key={s._id} className="mb-4 text-center">
                <div style={{ fontSize: 13, color: '#888' }}>Ca {s._id === 'sáng' ? 'Sáng' : 'Tối'}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: s._id === 'sáng' ? '#fa8c16' : '#1890ff' }}>
                  {formatNumber(s.total)}
                </div>
                <div style={{ fontSize: 12, color: '#aaa' }}>
                  {lockData.totalLockedItems > 0 ? Math.round(s.total / lockData.totalLockedItems * 100) : 0}%
                </div>
              </div>
            ))}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title={<span><ContainerOutlined /> Sản lượng chốt theo hãng tàu (Top 10)</span>} className="shadow-sm" size="small">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={byShippingLineData} layout="vertical" margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis dataKey="_id" type="category" tick={{ fontSize: 11 }} width={90} />
                <Tooltip />
                <Bar dataKey="total" fill="#722ed1" name="SL chốt" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>
    )
  }

  function renderWeekChart() {
    if (!chartsReady || !Recharts) return null
    const { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } = Recharts
    return (
      <Row gutter={[12, 12]} className="mb-4">
        <Col xs={24} lg={24}>
          <Card title={<span><BarChartOutlined /> Sản lượng chốt theo tuần (12 tuần gần nhất)</span>} className="shadow-sm" size="small">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={byWeekData} margin={{ top: 8, right: 8, left: -8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip labelFormatter={v => `Tuần ${v}`} />
                <Bar dataKey="total" fill="#722ed1" name="SL chốt" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>
    )
  }

  function renderMonthChart() {
    if (!chartsReady || !Recharts) return null
    const { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } = Recharts
    return (
      <Row gutter={[12, 12]} className="mb-4">
        <Col xs={24} lg={24}>
          <Card title={<span><BarChartOutlined /> Sản lượng chốt theo tháng (12 tháng)</span>} className="shadow-sm" size="small">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={byMonthData} margin={{ top: 8, right: 8, left: -8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="_id" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="total" fill="#eb2f96" name="SL chốt" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>
    )
  }

  const weekAvg = byWeekData.length ? Math.round(byWeekData.reduce((s, w) => s + w.total, 0) / byWeekData.length) : 0

  if (loading) return null
  if (error) return <Alert message={error} type="error" showIcon />
  if (!lockData || !containerData) return null

  return (
    <div>
      <Row gutter={[12, 12]}>
        <Col xs={12} sm={8} lg={4}>
          <Card className="shadow-sm" size="small">
            <Statistic title="Tổng sản lượng" value={formatNumber(lockData.totalLockedItems)} prefix={<LockOutlined />} valueStyle={{ color: '#13c2c2', fontSize: 24 }} />
            <div style={{ fontSize: 12, color: '#999' }}>{lockData.totalLocks} ca đã chốt</div>
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card className="shadow-sm" size="small">
            <Statistic title="Đã chốt hôm nay" value={formatNumber(lockData.todayLockedItems)} prefix={<CalendarOutlined />} valueStyle={{ color: '#722ed1', fontSize: 24 }} />
            <div style={{ fontSize: 12, color: '#999' }}>
              Sáng: {formatNumber(lockData.todayMorning)} / Tối: {formatNumber(lockData.todayEvening)}
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card className="shadow-sm" size="small">
            <Statistic title="Container hôm nay" value={formatNumber(containerData.todayContainers)} prefix={<ContainerOutlined />} valueStyle={{ color: '#fa8c16', fontSize: 24 }} />
            <Delta value={todayPct} />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card className="shadow-sm" size="small">
            <Statistic title="Sản lượng tháng này" value={formatNumber(lockData.monthLockedItems)} prefix={<FileTextOutlined />} valueStyle={{ color: '#eb2f96', fontSize: 24 }} />
            <Delta value={monthPct} />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card className="shadow-sm" size="small">
            <Statistic title="Container tháng này" value={formatNumber(containerData.monthContainers)} prefix={<ContainerOutlined />} valueStyle={{ color: '#fa8c16', fontSize: 24 }} />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card className="shadow-sm" size="small">
            <Statistic title="Tỉ lệ chốt" value={`${lockRate}%`} prefix={<ExperimentOutlined />} valueStyle={{ color: lockRate >= 80 ? '#52c41a' : lockRate >= 50 ? '#faad14' : '#f5222d', fontSize: 24 }} />
            <div style={{ fontSize: 12, color: '#999' }}>{formatNumber(lockData.totalLockedItems)}/{formatNumber(containerData.totalContainers)}</div>
          </Card>
        </Col>
      </Row>

      {renderChartRow()}

      <Tabs
        defaultActiveKey="day"
        className="mt-4"
        items={[
          {
            key: 'day',
            label: <span><CalendarOutlined /> Theo Ngày</span>,
            children: (
              <div>
                <Row gutter={[12, 12]} className="mb-4">
                  <Col xs={12} sm={8} lg={4}>
                    <Card className="shadow-sm" size="small">
                      <Statistic title="SL chốt hôm nay" value={formatNumber(lockData?.todayLockedItems || 0)} prefix={<LockOutlined />} valueStyle={{ color: '#722ed1', fontSize: 22 }} />
                      <div style={{ fontSize: 12, color: '#999' }}>
                        Sáng: {formatNumber(lockData?.todayMorning || 0)} / Tối: {formatNumber(lockData?.todayEvening || 0)}
                      </div>
                    </Card>
                  </Col>
                  <Col xs={12} sm={8} lg={4}>
                    <Card className="shadow-sm" size="small">
                      <Statistic title="Container hôm nay" value={formatNumber(containerData?.todayContainers || 0)} prefix={<ContainerOutlined />} valueStyle={{ color: '#fa8c16', fontSize: 22 }} />
                      <Delta value={todayPct} />
                    </Card>
                  </Col>
                  <Col xs={12} sm={8} lg={4}>
                    <Card className="shadow-sm" size="small">
                      <Statistic title="Tỉ lệ chốt hôm nay" value={`${todayLockPct}%`} prefix={<RiseOutlined />} valueStyle={{ color: todayLockPct >= 80 ? '#52c41a' : todayLockPct >= 50 ? '#faad14' : '#f5222d', fontSize: 22 }} />
                    </Card>
                  </Col>
                  <Col xs={12} sm={8} lg={4}>
                    <Card className="shadow-sm" size="small">
                      <Statistic title="TB/ngày (chốt)" value={formatNumber(dailyAvgLock)} prefix={<RiseOutlined />} valueStyle={{ color: '#2f54eb', fontSize: 22 }} />
                    </Card>
                  </Col>
                  <Col xs={12} sm={8} lg={4}>
                    <Card className="shadow-sm" size="small">
                      <Statistic title="Tổng chốt tháng" value={formatNumber(lockData?.monthLockedItems || 0)} prefix={<FileTextOutlined />} valueStyle={{ color: '#eb2f96', fontSize: 22 }} />
                      <Delta value={monthPct} />
                    </Card>
                  </Col>
                </Row>
                <Card title={<span><TableOutlined /> Chi tiết chốt theo ngày</span>} className="shadow-sm" size="small">
                  <Table
                    columns={dailyColumns}
                    dataSource={lockData?.dailyDetail || []}
                    rowKey="date"
                    pagination={{ pageSize: 15, size: 'small' }}
                    size="small"
                    scroll={{ x: 600 }}
                  />
                </Card>
              </div>
            ),
          },
          {
            key: 'week',
            label: <span><BarChartOutlined /> Theo Tuần</span>,
            children: (
              <div>
                <Row gutter={[12, 12]} className="mb-4">
                  <Col xs={12} sm={8} lg={4}>
                    <Card className="shadow-sm" size="small">
                      <Statistic title="Tuần này" value={formatNumber(byWeekData[byWeekData.length - 1]?.total || 0)} prefix={<CalendarOutlined />} valueStyle={{ color: '#722ed1', fontSize: 22 }} />
                    </Card>
                  </Col>
                  <Col xs={12} sm={8} lg={4}>
                    <Card className="shadow-sm" size="small">
                      <Statistic title="Tuần trước" value={formatNumber(byWeekData.length > 1 ? byWeekData[byWeekData.length - 2]?.total : 0)} prefix={<CalendarOutlined />} valueStyle={{ color: '#fa8c16', fontSize: 22 }} />
                    </Card>
                  </Col>
                  <Col xs={12} sm={8} lg={4}>
                    <Card className="shadow-sm" size="small">
                      <Statistic title="TB/tuần" value={formatNumber(weekAvg)} prefix={<RiseOutlined />} valueStyle={{ color: '#2f54eb', fontSize: 22 }} />
                    </Card>
                  </Col>
                  <Col xs={12} sm={8} lg={4}>
                    <Card className="shadow-sm" size="small">
                      <Statistic title="Số tuần" value={byWeekData.length} prefix={<FileTextOutlined />} valueStyle={{ color: '#13c2c2', fontSize: 22 }} />
                    </Card>
                  </Col>
                </Row>
                {renderWeekChart()}
                <Card title={<span><TableOutlined /> Chi tiết theo tuần</span>} className="shadow-sm" size="small">
                  <Table
                    columns={weeklyColumns}
                    dataSource={byWeekData}
                    rowKey="label"
                    pagination={false}
                    size="small"
                    scroll={{ x: 400 }}
                  />
                </Card>
              </div>
            ),
          },
          {
            key: 'month',
            label: <span><FileTextOutlined /> Theo Tháng</span>,
            children: (
              <div>
                <Row gutter={[12, 12]} className="mb-4">
                  <Col xs={12} sm={8} lg={6}>
                    <Card className="shadow-sm" size="small">
                      <Statistic title="Tháng này" value={formatNumber(lockData?.monthLockedItems || 0)} prefix={<FileTextOutlined />} valueStyle={{ color: '#eb2f96', fontSize: 22 }} />
                      <Delta value={monthPct} />
                    </Card>
                  </Col>
                  <Col xs={12} sm={8} lg={6}>
                    <Card className="shadow-sm" size="small">
                      <Statistic title="Container tháng này" value={formatNumber(containerData?.monthContainers || 0)} prefix={<ContainerOutlined />} valueStyle={{ color: '#fa8c16', fontSize: 22 }} />
                    </Card>
                  </Col>
                  <Col xs={12} sm={8} lg={6}>
                    <Card className="shadow-sm" size="small">
                      <Statistic title="TB/ngày (chốt)" value={formatNumber(lockData?.monthLockedItems ? Math.round(lockData.monthLockedItems / dayjs().daysInMonth()) : 0)} prefix={<RiseOutlined />} valueStyle={{ color: '#2f54eb', fontSize: 22 }} />
                    </Card>
                  </Col>
                  <Col xs={12} sm={8} lg={6}>
                    <Card className="shadow-sm" size="small">
                      <Statistic title="Tỉ lệ chốt tháng" value={`${lockData?.monthLockedItems && containerData?.monthContainers ? Math.round(lockData.monthLockedItems / containerData.monthContainers * 100) : 0}%`} prefix={<ExperimentOutlined />} valueStyle={{ color: '#13c2c2', fontSize: 22 }} />
                    </Card>
                  </Col>
                </Row>
                {renderMonthChart()}
                <Card title={<span><TableOutlined /> Chi tiết theo tháng</span>} className="shadow-sm" size="small">
                  <Table
                    columns={monthlyColumns}
                    dataSource={byMonthData}
                    rowKey="_id"
                    pagination={false}
                    size="small"
                    scroll={{ x: 400 }}
                  />
                </Card>
              </div>
            ),
          },
        ]}
      />

      <Row gutter={[12, 12]} className="mt-2">
        <Col xs={24} lg={14}>
          <Card title={<span><LockOutlined /> Sản lượng đã chốt (gần nhất)</span>} className="shadow-sm" size="small">
            <Table
              columns={lockTableColumns}
              dataSource={lockData?.recentLocks || []}
              rowKey="_id"
              pagination={false}
              size="small"
              scroll={{ x: 550 }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title={<span><RiseOutlined /> Container nhiều nhất tháng này</span>} className="shadow-sm" size="small">
            <Table
              columns={[
                { title: 'Container No', dataIndex: 'containerNo', key: 'containerNo' },
                { title: 'Hãng tàu', dataIndex: 'shippingLine', key: 'shippingLine' },
                { title: 'Size', dataIndex: 'size', key: 'size', width: 60 },
                { title: 'Số lần', dataIndex: 'count', key: 'count', width: 70, render: v => <Tag color={v > 1 ? 'red' : 'blue'}>{v}</Tag> },
              ]}
              dataSource={containerData?.topContainers || []}
              rowKey={(r, i) => i}
              pagination={false}
              size="small"
              scroll={{ x: 350 }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Dashboard