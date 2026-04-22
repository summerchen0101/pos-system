import { App } from 'antd'
import { useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { registerAdminApiAuthHandler } from '../api/adminApiAuthHandler'
import { useAuth } from '../auth/AuthContext'
import { zhtw } from '../locales/zhTW'

/**
 * 註冊後台 API 的 401/403 行為：401 → 登出並導向 /login；403 → 僅 Ant Design 提示。
 * 需放在 `BrowserRouter` 與 `AuthProvider` 內、且上層有 Antd `App` 以便使用 `message`。
 */
export function AdminApiAuthListener() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { message } = App.useApp()
  const a = zhtw.admin.api

  const onSessionLost = useCallback(
    async (from: string) => {
      message.destroy()
      await signOut()
      navigate('/login', { replace: true, state: { from } })
    },
    [message, navigate, signOut],
  )

  const onForbidden = useCallback(() => {
    message.error(a.forbidden, 4)
  }, [a.forbidden, message])

  useEffect(() => {
    registerAdminApiAuthHandler({ onSessionLost, onForbidden })
    return () => {
      registerAdminApiAuthHandler(null)
    }
  }, [onSessionLost, onForbidden])

  return null
}
