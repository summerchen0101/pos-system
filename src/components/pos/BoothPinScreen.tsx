import { DeleteOutlined } from '@ant-design/icons'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { zhtw } from '../../locales/zhTW'
import { setBoothPinVerifiedInSession } from '../../lib/boothPinSession'

const t = zhtw.pos

type Props = {
  boothId: string
  /** Main heading (e.g. booth name). */
  boothName: string
  expectedPin: string
  onVerified: () => void
}

export function BoothPinScreen({ boothId, boothName, expectedPin, onVerified }: Props) {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const len = expectedPin.length

  const appendDigit = useCallback(
    (d: string) => {
      if (error) setError(false)
      setValue((v) => {
        if (v.length >= len) return v
        return v + d
      })
    },
    [error, len],
  )

  const backspace = useCallback(() => {
    if (error) setError(false)
    setValue((v) => v.slice(0, -1))
  }, [error])

  const fail = useCallback(() => {
    setError(true)
    setValue('')
  }, [])

  useEffect(() => {
    if (value.length < len) return
    if (value === expectedPin) {
      setBoothPinVerifiedInSession(boothId)
      onVerified()
      return
    }
    fail()
  }, [value, len, expectedPin, boothId, onVerified, fail])

  useEffect(() => {
    if (!error) return
    const id = window.setTimeout(() => setError(false), 620)
    return () => window.clearTimeout(id)
  }, [error])

  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
  ] as const

  return (
    <div className={`pos-booth-pin${error ? ' pos-booth-pin--shake' : ''}`}>
      <div className="pos-booth-pin__card">
        <h1 className="pos-booth-pin__title">{boothName}</h1>
        <p className="pos-booth-pin__hint">{t.boothPinEnter}</p>
        <div className="pos-booth-pin__dots" aria-live="polite">
          {Array.from({ length: len }, (_, i) => (
            <span
              key={i}
              className={`pos-booth-pin__dot${i < value.length ? ' is-filled' : ''}${error ? ' is-error' : ''}`}
            />
          ))}
        </div>
        <div className="pos-booth-pin__keys">
          {keys.map((row) => (
            <div key={row.join()} className="pos-booth-pin__row">
              {row.map((k) => (
                <button
                  key={k}
                  type="button"
                  className="pos-booth-pin__key"
                  onClick={() => appendDigit(k)}>
                  {k}
                </button>
              ))}
            </div>
          ))}
          <div className="pos-booth-pin__row">
            <button type="button" className="pos-booth-pin__key pos-booth-pin__key--muted" onClick={() => navigate('/')}>
              {t.boothPinBack}
            </button>
            <button type="button" className="pos-booth-pin__key" onClick={() => appendDigit('0')}>
              0
            </button>
            <button
              type="button"
              className="pos-booth-pin__key pos-booth-pin__key--icon"
              onClick={backspace}
              aria-label={t.boothPinBackspace}>
              <DeleteOutlined />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
