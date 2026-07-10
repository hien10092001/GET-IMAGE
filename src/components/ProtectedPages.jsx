import { lazy, Suspense } from 'react'
import Login from '../pages/Login'

const ContainerManagement = lazy(() => import('../pages/ContainerManagement'))
const DepotsManagement = lazy(() => import('../pages/DepotManagement'))
const LockProduction = lazy(() => import('../pages/LockProduction'))

function ProtectedPages({ activeTab, user, onLogin }) {
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-120px)]">
        <Login onLogin={onLogin} />
      </div>
    )
  }

  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading...</div>}>
      {activeTab === 'containers' && <ContainerManagement />}
      {activeTab === 'depots' && <DepotsManagement />}
      {activeTab === 'sanluong' && <LockProduction />}
    </Suspense>
  )
}

export default ProtectedPages
