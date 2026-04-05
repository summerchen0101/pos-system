import { Card, Spin, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listBoothsAdmin } from '../api/boothsAdmin'
import { zhtw } from '../locales/zhTW'
import '../components/pos/pos.css'

const { Title, Text } = Typography
const t = zhtw.pos.boothPicker

export function PosBoothPickerPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [booths, setBooths] = useState<{ id: string; name: string; location: string | null }[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const list = await listBoothsAdmin()
        if (!cancelled) setBooths(list)
      } catch (e) {
        if (!cancelled) {
          setBooths([])
          setError(e instanceof Error ? e.message : zhtw.common.requestFailed)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="pos-layout" style={{ gridTemplateColumns: '1fr', placeItems: 'center', padding: '2rem' }}>
      <div style={{ maxWidth: 520, width: '100%' }}>
        <Title level={2} style={{ marginBottom: 8, color: 'var(--pos-text-strong)' }}>
          {t.title}
        </Title>
        <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
          {t.subtitle}
        </Text>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin />
          </div>
        ) : error ? (
          <Text type="danger">{error}</Text>
        ) : booths.length === 0 ? (
          <Text type="secondary">{t.empty}</Text>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {booths.map((b) => (
              <Link key={b.id} to={`/pos/${b.id}`} style={{ textDecoration: 'none' }}>
                <Card
                  hoverable
                  styles={{ body: { padding: '16px 18px' } }}
                  style={{ background: 'var(--pos-cart-bg)', borderColor: 'var(--pos-border)' }}>
                  <Title level={5} style={{ margin: 0, color: 'var(--pos-text-strong)' }}>
                    {b.name}
                  </Title>
                  {b.location ? (
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      {b.location}
                    </Text>
                  ) : null}
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
