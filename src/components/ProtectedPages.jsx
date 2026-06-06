import { lazy, Suspense } from 'react'
import TodoList from '../TodoList'
import Login from '../pages/Login'

const Dashboard = lazy(() => import('../pages/Dashboard'))
const ContainerManagement = lazy(() => import('../pages/ContainerManagement'))
const LockProduction = lazy(() => import('../pages/LockProduction'))

function ProtectedPages({ activeTab, user, onLogin }) {
  if (activeTab === 'todo') {
    return <TodoList />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-120px)]">
        <Login onLogin={onLogin} />
      </div>
    )
  }

  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading...</div>}>
      {activeTab === 'dashboard' && <Dashboard />}
      {activeTab === 'containers' && <ContainerManagement />}
      {activeTab === 'sanluong' && <LockProduction />}
    </Suspense>
  )
}

export default ProtectedPages
