import { useState } from 'react'
import { Card, Form, Input, Button, Alert, Typography } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import api from '../services/api'

const { Title } = Typography

function Login({ onLogin }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (values) => {
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/auth/login', values)
      localStorage.setItem('token', res.data.token)
      localStorage.setItem('user', JSON.stringify(res.data.user))
      onLogin(res.data.user)
    } catch (err) {
      setError(err.response?.data?.message || 'Đăng nhập thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-sm shadow-md">
        <Title level={3} className="text-center mb-6">Đăng nhập</Title>
        {error && <Alert message={error} type="error" showIcon className="mb-4" closable onClose={() => setError('')} />}
        <Form onFinish={handleSubmit} layout="vertical" size="large">
          <Form.Item name="username" rules={[{ required: true, message: 'Nhập username' }]}>
            <Input prefix={<UserOutlined />} placeholder="Username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: 'Nhập password' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Password" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              Đăng nhập
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default Login
