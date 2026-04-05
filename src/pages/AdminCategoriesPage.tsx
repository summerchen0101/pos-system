import { App, Button, Card, Form, Input, InputNumber, Modal, Space, Switch, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import {
  createCategory,
  deleteCategory,
  listCategoriesAdmin,
  updateCategory,
  type CategoryInput,
} from '../api/categoriesAdmin'
import type { Category } from '../types/pos'

const { Title, Text } = Typography

type FormValues = {
  name: string
  sortOrder: number
  isActive: boolean
}

function toInput(values: FormValues): CategoryInput {
  return {
    name: values.name,
    sortOrder: values.sortOrder,
    isActive: values.isActive,
  }
}

export function AdminCategoriesPage() {
  const { message, modal } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listCategoriesAdmin()
      setCategories(list)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to load categories')
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setEditingId(null)
    form.resetFields()
    const maxOrder = categories.reduce((m, c) => Math.max(m, c.sortOrder), 0)
    form.setFieldsValue({
      name: '',
      sortOrder: maxOrder + 1,
      isActive: true,
    })
    setModalOpen(true)
  }

  const openEdit = (c: Category) => {
    setEditingId(c.id)
    form.setFieldsValue({
      name: c.name,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
    form.resetFields()
  }

  const submit = async () => {
    try {
      const values = await form.validateFields()
      const input = toInput(values)
      setSaving(true)
      if (editingId) {
        await updateCategory(editingId, input)
        message.success('Category updated')
      } else {
        await createCategory(input)
        message.success('Category created')
      }
      closeModal()
      await load()
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return
      message.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const onDelete = (c: Category) => {
    modal.confirm({
      title: 'Delete category?',
      content: (
        <span>
          “{c.name}” will be removed. Products using this category will have their category cleared.
        </span>
      ),
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteCategory(c.id)
          message.success('Deleted')
          await load()
        } catch (e) {
          message.error(e instanceof Error ? e.message : 'Delete failed')
        }
      },
    })
  }

  const columns: ColumnsType<Category> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Sort order',
      dataIndex: 'sortOrder',
      key: 'sortOrder',
      width: 120,
      align: 'right',
    },
    {
      title: 'Active',
      dataIndex: 'isActive',
      key: 'active',
      width: 100,
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'default'}>{active ? 'Yes' : 'No'}</Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 140,
      render: (_, row) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEdit(row)}>
            Edit
          </Button>
          <Button type="link" size="small" danger onClick={() => onDelete(row)}>
            Delete
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="admin-page">
      <Space align="center" style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          Category Management
        </Title>
        <Button type="primary" onClick={openCreate}>
          New category
        </Button>
      </Space>

      <Card>
        <Table<Category>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={categories}
          pagination={{ pageSize: 12 }}
          scroll={{ x: true }}
        />
      </Card>

      <Modal
        title={editingId ? 'Edit category' : 'Create category'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => void submit()}
        confirmLoading={saving}
        destroyOnClose
        width={480}
        okText="Save"
      >
        <Form<FormValues> form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="sortOrder"
            label="Sort order"
            rules={[{ required: true, type: 'number', message: 'Required' }]}
          >
            <InputNumber min={0} step={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="isActive" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
