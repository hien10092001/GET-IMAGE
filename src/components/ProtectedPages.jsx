import { lazy, Suspense } from 'react'
import Login from '../pages/Login'
import { scopeForTab, requiredUsername, allowedUsernames, scopeLabel } from '../services/sectionAuth'

const ContainerManagement = lazy(() => import('../pages/ContainerManagement'))
const DepotsManagement = lazy(() => import('../pages/DepotManagement'))
const LockProduction = lazy(() => import('../pages/LockProduction'))
const SanLuongHT = lazy(() => import('../pages/SanLuongHT'))
const SlScPad = lazy(() => import('../pages/SlScPad'))

function ProtectedPages({ activeTab, user, onLogin }) {
  const scope = scopeForTab(activeTab)
  const expectedUsername = requiredUsername(scope)
  const allowed = allowedUsernames(scope)
  const authorized = user && (!allowed.length || allowed.includes(user.username))

  if (!authorized) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-120px)]">
        <Login
          onLogin={onLogin}
          scope={scope}
          expectedUsername={expectedUsername}
          allowedUsernames={allowed}
          sectionLabel={scopeLabel(scope)}
        />
      </div>
    )
  }

  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading...</div>}>
      {activeTab === 'containers' && <ContainerManagement />}
      {activeTab === 'depots' && <DepotsManagement />}
      {activeTab === 'sanluong' && <LockProduction />}
      {activeTab === 'sanluonght' && <SanLuongHT />}
      {activeTab === 'slscpad' && <SlScPad />}
    </Suspense>
  )
}

export default ProtectedPages
