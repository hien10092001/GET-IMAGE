import { Table, Tag, Typography } from 'antd'

const { Text } = Typography

function HistoryView({ dates, onSelectDate }) {
  const columns = [
    {
      title: 'Ngày',
      dataIndex: 'date',
      key: 'date',
      render: (d) => <Text strong>{d}</Text>,
    },
    {
      title: 'Số việc',
      dataIndex: 'total',
      key: 'total',
      width: 100,
      render: (total, record) => (
        <Tag color={record.completed === total ? 'green' : record.completed > 0 ? 'gold' : 'default'}>
          {record.completed}/{total}
        </Tag>
      ),
    },
    {
      title: 'Hành động',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <a onClick={() => onSelectDate(record.date)}>Xem</a>
      ),
    },
  ]

  const data = dates.map((d) => ({ date: d.date, total: d.total, completed: d.completed, key: d.date }))

  return (
    <div className="border border-gray-200 rounded-lg p-3 h-full">
      <Text strong className="block mb-3">📅 Lịch sử</Text>
      <Table
        columns={columns}
        dataSource={data}
        pagination={{ pageSize: 10, size: 'small' }}
        size="small"
        locale={{ emptyText: 'Chưa có ngày nào' }}
      />
    </div>
  )
}

export default HistoryView
