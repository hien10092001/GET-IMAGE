import { useState } from 'react'
import { Card, Form, Input, Button, Alert, Typography } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import api from '../services/api'
import { saveSession, allowedUsernames as allowedForScope } from '../services/sectionAuth'

const { Title, Text } = Typography

function Login({ onLogin, scope, allowedUsernames, sectionLabel }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (values) => {
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/auth/login', values)
      const user = res.data.user
      const allowed = Array.isArray(allowedUsernames) && allowedUsernames.length
        ? allowedUsernames
        : allowedForScope(scope)
      if (allowed.length && !allowed.includes(user.username)) {
        const hint = allowed.length === 1 ? `"${allowed[0]}"` : allowed.map(u => `"${u}"`).join(' hoặc ')
        setError(`Khu vực ${sectionLabel || 'này'} dùng tài khoản ${hint}`)
        return
      }
      const session = { token: res.data.token, user }
      if (scope) {
        saveSession(scope, session)
        localStorage.setItem('activeScope', scope)
      }
      localStorage.setItem('token', session.token)
      localStorage.setItem('user', JSON.stringify(user))
      onLogin(user)
    } catch (err) {
      setError(err.response?.data?.message || 'Đăng nhập thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-sm shadow-md">
        <Title level={3} className="text-center mb-2">Đăng nhập</Title>
        {sectionLabel && (
          <Text type="secondary" className="block text-center mb-5">Khu vực: {sectionLabel}</Text>
        )}
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
