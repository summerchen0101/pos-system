import { App, Button, Card, Checkbox, Form, Input, Modal, Select, Space, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { listBoothsAdmin, type AdminBooth } from '../api/boothsAdmin'
import type { AppRole } from '../api/authProfile'
import { listUsersAdmin, replaceUserBooths, updateAppUser, type AdminUserListEntry } from '../api/usersAdmin'
import { zhtw } from '../locales/zhTW'

const { Title, Text } = Typography
const u = zhtw.admin.users
const common = zhtw.common

type FormValues = {
  name: string
  role: AppRole
  boothIds: string[]
}

export function AdminUsersPage() {
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [rows, setRows] = useState<AdminUserListEntry[]>([])
  const [booths, setBooths] = useState<AdminBooth[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AdminUserListEntry | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ulist, blist] = await Promise.all([listUsersAdmin(), listBoothsAdmin()])
      setRows(ulist)
      setBooths(blist)
    } catch (e) {
      message.error(e instanceof Error ? e.message : u.loadError)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    void load()
  }, [load])

  const openEdit = (row: AdminUserListEntry) => {
    setEditing(row)
    form.setFieldsValue({
      name: row.name,
      role: row.role,
      boothIds: row.boothIds,
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditing(null)
    form.resetFields()
  }

  const submit = async () => {
    if (!editing) return
    try {
      const v = await form.validateFields()
      setSaving(true)
      await updateAppUser(editing.id, { name: v.name.trim(), role: v.role })
      const boothIds = v.role === 'ADMIN' ? [] : (v.boothIds ?? [])
      await replaceUserBooths(editing.id, boothIds)
      message.success(u.updated)
      closeModal()
      await load()
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return
      message.error(e instanceof Error ? e.message : u.saveError)
    } finally {
      setSaving(false)
    }
  }

  const columns: ColumnsType<AdminUserListEntry> = [
    {
      title: u.colName,
      dataIndex: 'name',
      key: 'name',
      render: (name: string, row) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          <Text type="secondary" copyable style={{ fontSize: 12 }}>
            {row.id}
          </Text>
        </Space>
      ),
    },
    {
      title: u.colRole,
      dataIndex: 'role',
      key: 'role',
      width: 100,
      render: (r: AppRole) => (r === 'ADMIN' ? u.roleAdmin : u.roleStaff),
    },
    {
      title: u.colBooths,
      key: 'booths',
      ellipsis: true,
      render: (_, row) => {
        if (row.role === 'ADMIN') return u.allBooths
        if (row.boothIds.length === 0) return common.dash
        const labels = row.boothIds
          .map((id) => booths.find((b) => b.id === id)?.name ?? id.slice(0, 8))
          .join('、')
        return labels
      },
    },
    {
      title: u.colActions,
      key: 'act',
      width: 100,
      render: (_, row) => (
        <Button type="link" size="small" onClick={() => openEdit(row)}>
          {common.edit}
        </Button>
      ),
    },
  ]

  const boothOptions = booths.map((b) => ({
    label: b.location ? `${b.name}（${b.location}）` : b.name,
    value: b.id,
  }))

  return (
    <div className="admin-page" style={{ padding: '0 24px 24px' }}>
      <Title level={4} style={{ marginTop: 0 }}>
        {u.pageTitle}
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        {u.hint}
      </Text>
      <Card>
        <Table<AdminUserListEntry>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={{ pageSize: 12 }}
        />
      </Card>

      <Modal
        title={u.modalEdit}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => void submit()}
        confirmLoading={saving}
        destroyOnClose
        width={520}
        okText={common.save}>
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 8 }}
          onValuesChange={(changed) => {
            if ('role' in changed && changed.role === 'ADMIN') {
              form.setFieldsValue({ boothIds: [] })
            }
          }}>
          <Form.Item name="name" label={u.labelName} rules={[{ required: true, message: common.required }]}>
            <Input placeholder={u.namePh} />
          </Form.Item>
          <Form.Item name="role" label={u.labelRole} rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'ADMIN', label: u.roleAdmin },
                { value: 'STAFF', label: u.roleStaff },
              ]}
            />
          </Form.Item>
          <Form.Item shouldUpdate={(prev, cur) => prev.role !== cur.role} noStyle>
            {() =>
              form.getFieldValue('role') === 'STAFF' ? (
                <Form.Item name="boothIds" label={u.labelBooths}>
                  <Checkbox.Group options={boothOptions} style={{ display: 'flex', flexDirection: 'column', gap: 8 }} />
                </Form.Item>
              ) : (
                <Text type="secondary">{u.adminBoothsHint}</Text>
              )
            }
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
