import { Button, Spin, Typography } from 'antd'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { zhtw } from '../locales/zhTW'

const { Text, Title } = Typography
const a = zhtw.auth

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, profile, loading, refreshProfile } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!profile) {
    return (
      <div style={{ padding: 48, textAlign: 'center', maxWidth: 400, margin: '0 auto' }}>
        <Title level={5}>{a.profileMissingTitle}</Title>
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          {a.profileMissingHint}
        </Text>
        <Button type="primary" onClick={() => void refreshProfile()}>
          {a.retry}
        </Button>
      </div>
    )
  }

  return <>{children}</>
}
