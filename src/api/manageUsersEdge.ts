import { supabase } from '../supabase'
import type { AppRole } from './authProfile'

export type ManagedUserRow = {
  id: string
  email: string
  name: string
  role: AppRole
  boothIds: string[]
}

type EdgePayload = { ok: true; users?: ManagedUserRow[] } | { ok: false; code: string; message?: string }

export class ManageUsersError extends Error {
  code: string

  constructor(code: string, message?: string) {
    super(message ?? code)
    this.name = 'ManageUsersError'
    this.code = code
  }
}

async function invokeManageUsers<T extends Record<string, unknown> = Record<string, never>>(
  body: Record<string, unknown>,
  accessToken: string,
): Promise<{ ok: true } & T> {
  const { data, error } = await supabase.functions.invoke<EdgePayload>('manage-users', {
    body,
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (error) {
    throw new ManageUsersError('INVOCATION_FAILED', error.message)
  }

  if (!data) {
    throw new ManageUsersError('NO_RESPONSE')
  }

  if (data.ok === false) {
    throw new ManageUsersError(data.code, data.message)
  }

  return data as { ok: true } & T
}

export async function listManagedUsers(accessToken: string): Promise<ManagedUserRow[]> {
  const res = await invokeManageUsers<{ users?: ManagedUserRow[] }>({ action: 'list' }, accessToken)
  return res.users ?? []
}

export async function createManagedUser(
  accessToken: string,
  input: {
    email: string
    password: string
    name: string
    role: AppRole
    boothIds: string[]
  },
): Promise<void> {
  await invokeManageUsers(
    {
      action: 'create',
      email: input.email.trim(),
      password: input.password,
      name: input.name.trim(),
      role: input.role,
      boothIds: input.role === 'STAFF' ? input.boothIds : [],
    },
    accessToken,
  )
}

export async function updateManagedUser(
  accessToken: string,
  input: {
    userId: string
    name: string
    role: AppRole
    boothIds: string[]
    password?: string
  },
): Promise<void> {
  const payload: Record<string, unknown> = {
    action: 'update',
    userId: input.userId,
    name: input.name.trim(),
    role: input.role,
    boothIds: input.role === 'STAFF' ? input.boothIds : [],
  }
  if (input.password && input.password.length > 0) {
    payload.password = input.password
  }
  await invokeManageUsers(payload, accessToken)
}

export async function deleteManagedUser(accessToken: string, userId: string): Promise<void> {
  await invokeManageUsers({ action: 'delete', userId }, accessToken)
}
